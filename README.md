# CrewCatch AI

B2B voice automation for North American contractors. Answers missed,
after-hours, and overflow inbound calls, qualifies them against
trade-specific questions, and dispatches the resulting lead by SMS within
30 seconds.

**Pricing model:** $1,500 setup · $499/month.

> **Status: not yet in production.** Read [What is not real yet](#what-is-not-real-yet)
> before promising anything to a customer. The vendor payload mapping is
> unfinished, contact enquiries are not delivered, and tenant isolation has
> never executed against a live database.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Styling | Tailwind v4 (CSS-first `@theme`), Archivo + JetBrains Mono |
| Data | Supabase (Postgres + Auth), Row Level Security on all 8 tables |
| Telephony | Twilio |
| Voice agent | Retell AI |
| Workflow | Make.com |
| Tests | Vitest 5, Testing Library, Playwright + axe-core, pgTAP |

---

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in what you have; everything is optional
npm run dev
```

With no credentials the app runs in **demo mode**: the marketing site works
fully, and the portal renders clearly-labelled sample data so the UI can be
explored without a database.

### Environment variables

Only three are needed to leave demo mode:

| Variable | Where to get it | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project → Connect | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → **API Keys** | The publishable key. Legacy `anon` JWTs are deprecated by end of 2026. |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → **API Keys** → Secret keys | **Bypasses RLS.** Ingestion and admin only. |

`INTEGRATION_MODE=live` additionally requires the Twilio and Retell
credentials in `.env.example`, and fails loudly at boot if any are missing.

> `.env.example` is a **template**. Real values go in `.env.local`, which is
> gitignored. `npm run lint:env` fails the build if a credential is pasted into
> the template.

---

## Database

```bash
supabase link --project-ref <ref>
supabase db push          # applies 0001 (schema) then 0002 (tenant model)
supabase test db          # 27 RLS isolation assertions
```

**`supabase test db` is the security gate.** It proves one contractor cannot
read another's rows. It requires a reachable database — CI runs it when the
project secrets are configured, and skips it otherwise.

`scripts/check-rls.mjs` (part of `npm run check`) is the network-free
structural check: it proves the policies *exist*. It cannot prove they
*behave* — only the pgTAP suite can.

---

## Operator setup

```bash
# 1. Grant yourself operator access (unreachable without this)
npm run admin:bootstrap -- you@yourdomain.com
npm run admin:bootstrap -- you@yourdomain.com --revoke   # revoke

# 2. Onboard a contractor at /admin/contractors/new
```

Admin status is read from `app_metadata`, never `user_metadata` — the latter
is writable by the user from the browser, so trusting it would let any
contractor promote themselves.

`/admin` is gated in three places (proxy, layout, and every API route). The
route handler is the one that matters: it is a separate entry point, and the
service-role client it uses bypasses RLS.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run check` | Typecheck + lint + tests + design guard + RLS structure + env guard |
| `npm test` | 170 unit and component tests |
| `npm run audit:a11y` | WCAG 2.1 AA, 16 pages × 2 themes (needs a server on :3111) |
| `npm run build` | Production build |
| `npm run check:rls` | RLS policy structure, no database needed |
| `npm run lint:design` | Bans gradients, glassmorphism, rounded corners, off-palette colour |
| `npm run lint:env` | Fails if `.env.example` contains a real credential |
| `npm run admin:bootstrap` | Grants or revokes operator access |

CI runs all of these on every push.

---

## Design system

Dark industrial: navy `#0A1628`, high-visibility orange `#FF6B00`, Archivo for
UI, JetBrains Mono for metrics. Every colour is a **measured** value, not a
taste call — the four contrast rules the theme depends on are documented in
`src/app/globals.css` and the palette clears WCAG AA in both light and dark.

`npm run lint:design` fails the build on a gradient, a rounded corner, a
soft shadow, or off-palette colour, so the visual mandate is machine-enforced
rather than a review comment someone forgets.

---

## What is not real yet

**Do not represent any of the following as working.**

- **Inbound vendor payload mapping is unfinished.** The webhook returns `501`
  for a real Retell payload. Vendor documentation was unreachable during
  development, and guessing field names would produce a contract that looks
  correct and silently mismatches the real webhook at launch.
  See `docs/integrations/README.md`.
- **Contact enquiries are not delivered.** The form validates and logs with
  `delivered: false`; nothing sends them.
- **No billing.** Stripe is absent. `overageCost` is deliberately `null`
  because no overage rate has been set — a fabricated invoice number is worse
  than an open question.
- **Phone numbers are not auto-provisioned.** Provisioning is mocked; buying a
  real number costs money monthly and needs a regulatory address, so it stays a
  manual operator step.
- **Email and CRM dispatch are not implemented.** Only SMS has a live adapter.
- **Tenant isolation has not executed.** The 27 pgTAP assertions are written and
  validated statically, but have never run against a live database.

---

## Architecture

```
src/
├── app/
│   ├── (marketing)/     public site, no auth
│   ├── (portal)/        client portal + /admin, session-gated
│   └── api/             webhooks, auth callback, contact, health, admin
├── components/          ui/ marketing/ portal/
├── content/trades/      MDX trade pages
└── lib/
    ├── domain/          zod schemas, ROI, qualification, prompt rendering
    ├── integrations/    provider seam + mocks + Twilio SMS
    ├── portal/          RLS-scoped queries and ingestion writes
    ├── admin/           authorization guard + onboarding
    └── observability/   structured logging with PII redaction
```

`lib/domain/schemas.ts` is the single source of truth: every entity is defined
once as a zod schema and the TypeScript types are inferred from it.

`lib/integrations/types.ts` is the seam. Every external system is reached
through one of four interfaces, so a live provider is a drop-in replacement
that no caller has to change.

---

## Security posture

- **RLS on all 8 tables**, enabled *and* forced, so a privileged role cannot
  bypass it by accident.
- **The service-role client is machine-restricted.** Importing it into a portal
  render path is an ESLint error — it bypasses RLS, so a single wrong import
  would return every tenant's rows.
- **Webhook HMAC** is verified over the raw body before parsing, with a
  constant-time compare. Signatures are checked before anything in the payload
  is trusted.
- **Admin status** comes from `app_metadata`, not user-writable
  `user_metadata`.
- **Logs redact** caller phone numbers, names, addresses, transcripts, and
  credentials by default, keeping only field lengths.
- **Lead extraction fails closed** — a lead missing a name or callback number
  is never dispatched as if complete.
