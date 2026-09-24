import { NextResponse, type NextRequest } from "next/server";
import { getProviders } from "@/lib/integrations";
import { verifyWebhookSignature } from "@/lib/integrations/signature";
import { CallCompletedEvent, TRADE_TIER, Trade } from "@/lib/domain/schemas";
import { extractLead } from "@/lib/domain/lead-extraction";

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

  // TODO[CRITICAL]: Persist the call and lead via the service-role client,
  // then dispatch. Deliberately not implemented rather than faked: writing to
  // `calls` requires the real contractor id resolved from the routed number,
  // and that mapping is provider-specific.
  //
  // Required data:
  //   - contractor_id, resolved from the dialled CrewCatch number
  //   - calls row: transcript, intent, urgency, duration, qualified = true
  //   - leads row: name, phone, address, urgency, intent, issue
  //   - dispatch via WorkflowProvider.dispatchLead(lead, contractor.channels)
  //
  // The service-role client MUST be used here and nowhere else; see
  // lib/supabase/admin.ts.

  const { voice, workflow } = getProviders();
  await voice.getCallTranscript(event.externalCallId);

  console.info(
    `[webhook] qualified ${tier} lead for trade ${trade}; dispatch pending persistence.`,
  );

  return NextResponse.json(
    {
      status: "accepted",
      trade,
      tier,
      lead: extraction.lead,
      dispatch: "pending",
    },
    { status: 202 },
  );
}
