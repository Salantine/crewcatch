import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/integrations/signature";
import {
  CallCompletedEvent,
  TRADE_TIER,
  Trade,
  type Lead,
} from "@/lib/domain/schemas";
import { extractLead } from "@/lib/domain/lead-extraction";
import {
  persistCall,
  persistLead,
  resolveContractorForNumber,
} from "@/lib/portal/persistence";
import { dispatchLead } from "@/lib/dispatch/dispatch-lead";

/**
 * Ingestion endpoint for completed calls.
 *
 * Order of operations matters and is not interchangeable:
 *   1. Read the RAW body — the signature is computed over those exact bytes.
 *      `await req.json()` first would consume the stream and change the bytes.
 *   2. Verify the signature BEFORE trusting anything in the payload.
 *   3. Validate the payload against the internal contract.
 *   4. Extract a lead, and dispatch only if extraction fully succeeded.
 *
 * A vendor must never be able to make us dispatch a lead by posting an
 * unsigned request to a public URL.
 */

export const runtime = "nodejs";

/** Trades the caller could belong to; narrowed by the contractor record. */
function isTrade(value: string): value is Trade {
  return (Object.values(Trade) as string[]).includes(value);
}

export async function POST(request: NextRequest) {
  // 1. Raw body first.
  const rawBody = await request.text();

  // 2. Signature verification.
  const secret = process.env.RETELL_WEBHOOK_SECRET;
  const headerName = process.env.RETELL_SIGNATURE_HEADER ?? "x-retell-signature";

  if (!secret) {
    console.error("[webhook] RETELL_WEBHOOK_SECRET is not set — refusing the request.");
    return NextResponse.json({ error: "server_not_configured" }, { status: 503 });
  }

  const verification = verifyWebhookSignature({
    rawBody,
    signature: request.headers.get(headerName),
    secret,
  });

  if (!verification.valid) {
    console.warn(
      `[webhook] signature rejected (${verification.reason}) from ${
        request.headers.get("user-agent") ?? "unknown client"
      }`,
    );
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // 3. Parse and validate against our internal contract.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // TODO[CRITICAL]: Map the vendor payload → CallCompletedEvent.
  // The field names are unverified in this environment (see
  // lib/integrations/vendor-schemas.ts). Until the operator supplies the real
  // sample payload, a body that is already in our internal shape is accepted so
  // the pipeline is testable end to end; anything else is rejected rather than
  // guessed at.
  const internal = CallCompletedEvent.safeParse(parsed);
  if (!internal.success) {
    console.warn(
      "[webhook] payload did not match CallCompletedEvent; vendor mapping not yet implemented.",
    );
    return NextResponse.json(
      { error: "unmapped_vendor_payload", issues: internal.error.issues.length },
      { status: 501 },
    );
  }

  const event = internal.data;
  const tradeMeta = event.metadata.trade;
  const trade: Trade = tradeMeta && isTrade(tradeMeta) ? tradeMeta : "hvac";
  const tier = TRADE_TIER[trade];

  // 4. Extract. A partial extraction is NOT dispatched — see lead-extraction.ts.
  const extraction = extractLead(event, { trade });

  if (!extraction.ok) {
    console.info(
      `[webhook] call ${event.externalCallId} captured but not qualified (${extraction.reason}).`,
    );
    return NextResponse.json(
      { status: "captured_not_qualified", reason: extraction.reason },
      { status: 200 },
    );
  }

  // 5. Resolve the contractor from the dialled number. Without this we cannot
  //    write a tenant-scoped row, and guessing would risk one contractor
  //    receiving another customer's call.
  const dialled = event.metadata.dialledNumber ?? event.metadata.to;
  if (!dialled) {
    console.warn(
      "[webhook] no dialled number in metadata — cannot resolve the contractor.",
    );
    return NextResponse.json(
      { status: "unresolved", reason: "missing_dialled_number" },
      { status: 202 },
    );
  }

  const resolved = await resolveContractorForNumber(dialled);
  if (!resolved.ok) {
    // `detail` carries the underlying cause (e.g. missing Supabase credentials).
    // Logging the reason alone leaves the operator unable to tell a
    // provisioning gap from a misconfigured environment.
    console.warn(
      `[webhook] could not resolve contractor for ${dialled} (${resolved.reason})${
        resolved.detail ? `: ${resolved.detail}` : ""
      }`,
    );
    // 202, not 4xx: the request was valid and authenticated. Retrying will not
    // fix a provisioning gap, and a 4xx would make the vendor treat it as
    // permanently undeliverable and stop retrying — which is what we want.
    return NextResponse.json(
      { status: "unresolved", reason: resolved.reason },
      { status: 202 },
    );
  }

  const { contractorId, dispatchChannels } = resolved.data;

  // 6. Persist the call. Idempotent — a replayed webhook reuses the row.
  const callResult = await persistCall({
    event,
    contractorId,
    intent: extraction.lead.intent,
    urgency: extraction.lead.urgency,
    qualified: true,
  });

  if (!callResult.ok) {
    console.error(
      `[webhook] failed to persist call ${event.externalCallId}: ${callResult.reason} ${callResult.detail ?? ""}`,
    );
    return NextResponse.json(
      { status: "persistence_failed", reason: callResult.reason },
      { status: 500 },
    );
  }

  const callId = callResult.data.id;

  // 7. Persist the lead, then dispatch it.
  const leadRow = await persistLead(contractorId, callId, {
    name: extraction.lead.name,
    phone: extraction.lead.phone,
    address: extraction.lead.address,
    intent: extraction.lead.intent,
    urgency: extraction.lead.urgency,
    issue: extraction.lead.issue,
  });

  if (!leadRow.ok) {
    console.error(
      `[webhook] failed to persist lead for call ${callId}: ${leadRow.reason} ${leadRow.detail ?? ""}`,
    );
    return NextResponse.json(
      { status: "persistence_failed", reason: leadRow.reason },
      { status: 500 },
    );
  }

  const lead: Lead = {
    // The extractor returns a `callId: ""` placeholder (the persistence layer
    // owns identity), so the real ids must be applied AFTER the spread.
    ...extraction.lead,
    id: leadRow.data.id,
    contractorId,
    callId,
    capturedAt: new Date().toISOString(),
  };

  const dispatches = await dispatchLead({
    contractorId,
    lead,
    channels: dispatchChannels,
  });

  const delivered = dispatches.filter((d) => d.delivered).length;

  console.info(
    `[webhook] lead ${lead.id} persisted; ${delivered}/${dispatches.length} channel(s) delivered.`,
  );

  return NextResponse.json(
    {
      status: "accepted",
      trade,
      tier,
      callId,
      leadId: lead.id,
      replayed: !callResult.data.created,
      dispatch: dispatches.map((d) => ({
        channel: d.channel,
        delivered: d.delivered,
        attempts: d.attempts,
        elapsedMs: d.elapsedMs,
        withinSla: d.withinSla,
      })),
    },
    { status: 202 },
  );
}
