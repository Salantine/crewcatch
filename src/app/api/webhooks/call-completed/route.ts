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
import { log } from "@/lib/observability/logger";

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
    log.error("webhook.not_configured", { hint: "RETELL_WEBHOOK_SECRET missing" });
    return NextResponse.json({ error: "server_not_configured" }, { status: 503 });
  }

  const verification = verifyWebhookSignature({
    rawBody,
    signature: request.headers.get(headerName),
    secret,
  });

  if (!verification.valid) {
    log.warn("webhook.signature_rejected", {
      reason: verification.reason,
      userAgent: request.headers.get("user-agent") ?? "unknown",
    });
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
    log.warn("webhook.unmapped_vendor_payload", { issues: internal.error.issues.length });
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
    log.info("webhook.not_qualified", {
      externalCallId: event.externalCallId,
      reason: extraction.reason,
    });
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
    log.warn("webhook.missing_dialled_number", {
      externalCallId: event.externalCallId,
    });
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
    log.warn("webhook.contractor_unresolved", {
      externalCallId: event.externalCallId,
      reason: resolved.reason,
      detail: resolved.detail,
    });
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
    log.error("webhook.persist_call_failed", {
      externalCallId: event.externalCallId,
      reason: callResult.reason,
      detail: callResult.detail,
    });
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
    log.error("webhook.persist_lead_failed", {
      callId,
      reason: leadRow.reason,
      detail: leadRow.detail,
    });
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

  log.info("webhook.lead_dispatched", {
    leadId: lead.id,
    callId,
    replayed: !callResult.data.created,
    delivered,
    channels: dispatches.length,
  });

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
