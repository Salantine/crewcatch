import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { Trade } from "@/lib/domain/schemas";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";

/**
 * Inbound sales enquiries from the marketing site.
 *
 * Unauthenticated by design — this is a public contact form, and requiring
 * an account would defeat its purpose.
 *
 * Because it is unauthenticated it is also spam-able. Defences here are
 * deliberately cheap and layered: zod validation, a length cap, and a honeypot
 * field that real users never see. Anything heavier belongs at the edge
 * (rate limiting), not in a handler that must not slow down a real enquiry.
 *
 * ⚠ PII: the logger redacts name/email/phone by key, so an enquiry is
 * recorded as a reference with lengths, not as a customer's details.
 */

const Body = z.object({
  name: z.string().min(1).max(120),
  business: z.string().min(1).max(160),
  email: z.email().max(200),
  phone: z.string().max(40).optional().default(""),
  trade: Trade,
  message: z.string().max(2000).optional().default(""),
  // Honeypot: hidden from users, filled by bots. Constrained rather than
  // rejected, so a filled field is judged on its own below instead of
  // producing a 400 that tells the bot exactly what tripped it.
  company_url: z.string().max(200).optional(),
});

/** Short, human-quotable reference so support can correlate a reply. */
function reference(): string {
  return `CC-${Date.now().toString(36).toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => null);

  // Honeypot is checked BEFORE validation: a bot that filled the hidden field
  // gets a normal-looking success so it does not learn to adapt.
  if (
    raw &&
    typeof raw === "object" &&
    "company_url" in raw &&
    typeof (raw as { company_url?: unknown }).company_url === "string" &&
    (raw as { company_url: string }).company_url.length > 0
  ) {
    log.warn("contact.honeypot_triggered", {});
    return NextResponse.json({ ok: true, reference: reference() }, { status: 202 });
  }

  const parsed = Body.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues.length },
      { status: 400 },
    );
  }

  const ref = reference();

  // TODO[CRITICAL]: Deliver the enquiry.
  //
  // Nothing currently sends it. The enquiry is logged (redacted) so it is at
  // least not silently lost, but an operator must actually receive it.
  //
  // Required: an outbound email or CRM write carrying name, business, email,
  // phone, trade, and the message, tagged with the reference so a reply can
  // be matched back. The notification seam to build on is
  // getNotificationChannel() in src/lib/integrations/index.ts.
  //
  // Until then, `npm run check` must not imply this is delivered: the log
  // line below is the only record.

  log.info("contact.received", {
    reference: ref,
    trade: parsed.data.trade,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    business: parsed.data.business,
    delivered: false,
  });

  return NextResponse.json({ ok: true, reference: ref }, { status: 202 });
}
