import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminIdentity } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProviders } from "@/lib/integrations";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";

/**
 * Updates a contractor's prompt profile.
 *
 * ⚠ ADMIN ONLY. Writes with the service-role client (RLS bypass) and
 * re-pushes to the voice agent. Authorization is re-checked here rather than
 * assumed from the layout or proxy — a route handler is a separate entry
 * point, and an unguarded one would let any authenticated contractor rewrite
 * every prompt in the system.
 */

const Body = z.object({
  greeting: z.string().min(1).max(500),
  afterHoursOnly: z.boolean(),
  objections: z.record(z.string().min(1), z.string().min(1)),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const identity = await getAdminIdentity();
  if (!identity.isAdmin) {
    // 404 rather than 403: a 403 confirms the endpoint exists.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues.length },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Load the existing profile so the update is a full-row write against a
  // known trade/business, and so the agent push has everything it needs.
  const { data: existing, error: readError } = await supabase
    .from("prompt_profiles")
    .select("id, trade, business_name")
    .eq("contractor_id", id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) {
    return NextResponse.json(
      { error: "read_failed", detail: readError.message },
      { status: 500 },
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "no_prompt_profile" }, { status: 404 });
  }

  const profile = existing as { id: string; trade: string; business_name: string };

  const { error: updateError } = await supabase
    .from("prompt_profiles")
    .update({
      greeting: parsed.data.greeting,
      after_hours_only: parsed.data.afterHoursOnly,
      objections: parsed.data.objections,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (updateError) {
    log.error("admin.prompt_update_failed", {
      contractorId: id,
      detail: updateError.message,
    });
    return NextResponse.json(
      { error: "update_failed", detail: updateError.message },
      { status: 500 },
    );
  }

  // Push to the voice agent. A failure here is reported but does NOT roll
  // back the database write: the operator's edit is the source of truth, and
  // silently discarding it would be worse than a stale agent that the next
  // sync picks up. The response says which happened.
  let pushed = false;
  let pushDetail: string | undefined;
  try {
    const { voice } = getProviders();
    const agentRef = await voice.createAgent({
      id: profile.id,
      contractorId: id,
      trade: profile.trade as never,
      businessName: profile.business_name,
      greeting: parsed.data.greeting,
      objections: parsed.data.objections,
      afterHoursOnly: parsed.data.afterHoursOnly,
      updatedAt: new Date().toISOString(),
    });
    await voice.updateAgent(agentRef.agentId, {
      id: profile.id,
      contractorId: id,
      trade: profile.trade as never,
      businessName: profile.business_name,
      greeting: parsed.data.greeting,
      objections: parsed.data.objections,
      afterHoursOnly: parsed.data.afterHoursOnly,
      updatedAt: new Date().toISOString(),
    });
    pushed = true;
  } catch (err) {
    pushDetail = err instanceof Error ? err.message : String(err);
    log.warn("admin.prompt_push_failed", { contractorId: id, detail: pushDetail });
  }

  log.info("admin.prompt_updated", {
    contractorId: id,
    pushed,
    objectionCount: Object.keys(parsed.data.objections).length,
  });

  return NextResponse.json({ ok: true, pushed, pushDetail });
}
