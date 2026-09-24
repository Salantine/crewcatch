# Integration runbooks

**These are operator steps. They are not optional polish — the codebase cannot
reach production without them.**

## Why this file exists

The vendor webhook payload shapes for **Twilio** and **Retell** could not be
verified from this build environment: requests to `twilio.com/docs` and
`docs.retellai.com` returned HTTP 404, and web search was unavailable.

Rather than invent field names, the inbound schemas in
`src/lib/integrations/vendor-schemas.ts` are passthrough, with `TODO[CRITICAL]`
markers naming exactly what each mapper must consume. **Guessed field names
would produce a contract that looks correct and silently mismatches the real
webhook at launch** — the worst possible failure for something that dispatches
leads to a contractor's phone.

What *is* implemented and tested: raw-body ingestion, HMAC-SHA256 signature
verification with constant-time comparison, and the internal
`CallCompletedEvent` contract.

## 1. Retell AI

**Get the payload shape**
1. Retell dashboard → your agent → **Webhook settings**
2. Copy the **Sample payload** the dashboard shows
3. Paste it into `tests/fixtures/retell-call-ended.sample.json`
4. Map it in the `TODO[CRITICAL]` block in
   `src/app/api/webhooks/call-completed/route.ts`

**Required from the payload:** call id · start/end timestamps · duration ·
`transcript[]` (role, content, timestamp) · call metadata / custom variables.

**Signature**
- Algorithm: HMAC over the **raw body**, verified before `JSON.parse()`
- Header name: set `RETELL_SIGNATURE_HEADER` to the dashboard's value
  (default `x-retell-signature` — **unverified**)
- Check whether the header is prefixed (`sha256=…`); the verifier strips a
  prefix automatically

**Credentials**
```bash
RETELL_WEBHOOK_SECRET=<from webhook settings>
RETELL_API_KEY=<api key>
RETELL_AGENT_ID=<agent id>
INTEGRATION_MODE=live
```

**Verify**
```bash
curl -X POST http://localhost:3000/api/webhooks/call-completed \
  -H "content-type: application/json" \
  -H "x-retell-signature: $(node -e 'console.log(require("crypto").createHmac("sha256",process.env.RETELL_WEBHOOK_SECRET).update(process.argv[1]).digest("hex"))' "$BODY")" \
  -d "$BODY"
```
Expect `202 accepted` for a qualified lead, `200 captured_not_qualified` when
name or number is missing, `401` if the signature is wrong.

## 2. Twilio

**Get the payload shape**
1. Twilio console → Phone Numbers → your number → **Voice → Call Recording
   Settings**, or inspect a real webhook log on a test number
2. Save it to `tests/fixtures/twilio-status-callback.sample.json`

**Required:** call identifier · call status · duration · caller number · dialled
number · recording URL (if enabled).

**Signature**
- Twilio uses an HMAC-SHA1 of the URL plus sorted POST parameters and a
  **custom header** — the header name must be confirmed
- `verifyWebhookSignature({ algorithm: "sha1" })` is already supported and tested

**Number provisioning** happens through `TelephonyProvider.provisionNumber()`.
The mock issues `+1555 01xx xxxx` (the fictional North American block) so demos
can never reach a real person.

**Credentials**
```bash
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
INTEGRATION_MODE=live
```

## 3. Make.com

CrewCatch POSTs a captured lead to a Make scenario, which fans out to SMS,
email, and CRM.

The proposed body is documented in `vendor-schemas.ts` as
`MakeDispatchPayload` and is already validated by zod. Build the scenario
against it, then set:

```bash
MAKE_SCENARIO_WEBHOOK_URL=<scenario webhook>
```

**Non-2xx must be retried with backoff** and surfaced in the portal — a dropped
dispatch is a lost lead.

## 4. Supabase

1. Create a project
2. Run `supabase/migrations/0001_init.sql` (or `supabase db push`)
3. Set:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...   # ingestion only, never a render path
   ```
4. Seed a contractor and link it to an `auth.users` row

Verify tenant isolation before going live — sign in as two contractors and
confirm neither can see the other's leads. `npm run check:rls` validates the
policy coverage but not the runtime behaviour.

## What still needs implementing

| Area | Status |
|---|---|
| Inbound vendor → `CallCompletedEvent` mapping | **Blocked** on payload shapes |
| Persistence (`calls` / `leads` insert) | Needs contractor resolution from the dialled number |
| Dispatch fan-out | Interface ready, no live impl |
| Portal queries | Demo data now; RLS-scoped queries documented in `src/lib/portal/data.ts` |
| Settings mutations | Not wired |
