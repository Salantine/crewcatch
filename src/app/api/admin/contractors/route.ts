import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminIdentity } from "@/lib/admin/guard";
import { onboardContractor } from "@/lib/admin/onboarding";
import {
  DispatchChannel,
  Trade,
  ContractorTier,
} from "@/lib/domain/schemas";

export const runtime = "nodejs";

/**
 * Creates a contractor.
 *
 * ⚠ ADMIN ONLY. This route provisions real phone numbers and writes with the
 * service-role client (which bypasses RLS). Authorization is re-checked here
 * independently of the proxy and the admin layout — a route handler is a
 * separate entry point and neither of those covers it. Assuming a route is
 * unreachable because a layout is guarded is exactly the mistake that exposes
 * every customer's data.
 */

const Body = z.object({
  name: z.string().min(1),
  primaryTrade: Trade,
  tier: ContractorTier,
  regions: z.array(z.string().min(2)).min(1),
  dispatchChannels: z.array(DispatchChannel).min(1),
  ownerEmail: z.email().optional(),
});

export async function POST(request: NextRequest) {
  const identity = await getAdminIdentity();
  if (!identity.isAdmin) {
    // 404, not 403: a 403 confirms the endpoint exists.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues.length },
      { status: 400 },
    );
  }

  // Look up the owner by email if given. `listUsers` is admin-only and
  // requires the service-role client, which is why this lives here.
  let ownerUserId: string | undefined;
  if (parsed.data.ownerEmail) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      const { data: list, error: listError } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (listError) throw new Error(listError.message);
      const match = list.users.find(
        (u: { email?: string }) =>
          u.email?.toLowerCase() === parsed.data.ownerEmail!.toLowerCase(),
      );
      if (!match) {
        return NextResponse.json(
          { error: "auth_user_missing", detail: "no account with that email" },
          { status: 400 },
        );
      }
      ownerUserId = match.id;
    } catch (err) {
      return NextResponse.json(
        {
          error: "persistence_failed",
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 500 },
      );
    }
  }

  const result = await onboardContractor({
    name: parsed.data.name,
    primaryTrade: parsed.data.primaryTrade,
    tier: parsed.data.tier,
    regions: parsed.data.regions,
    dispatchChannels: parsed.data.dispatchChannels,
    ownerUserId,
    ownerEmail: parsed.data.ownerEmail,
  });

  if (!result.ok) {
    const status = result.error === "provisioning_failed" ? 502 : 400;
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status },
    );
  }

  return NextResponse.json({ contractor: result.data }, { status: 201 });
}
