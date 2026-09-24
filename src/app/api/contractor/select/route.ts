import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Records which contractor a multi-entity user is working in.
 *
 * The choice is stored in a cookie, which `proxy.ts` forwards as
 * `x-contractor-id` and `current_contractor_id()` validates against the
 * caller's memberships. A forged value is rejected there — this route only
 * records the intent; it is not the authorization boundary.
 */
export async function POST(request: NextRequest) {
  // `createClient()` throws when Supabase is not configured (demo mode).
  // An unauthenticated caller must get 401, not a 500 that reads as a
  // server fault, and the failure must be closed either way.
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  try {
    supabase = await createClient();
  } catch {
    supabase = null;
  }

  const user = supabase
    ? (await supabase.auth.getUser()).data.user
    : null;

  if (!user || !supabase) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    contractorId?: unknown;
  } | null;

  const contractorId = typeof body?.contractorId === "string" ? body.contractorId : "";

  if (!/^[0-9a-f-]{36}$/i.test(contractorId)) {
    return NextResponse.json({ error: "invalid_contractor" }, { status: 400 });
  }

  // Only record a contractor the user actually belongs to. Belt and braces
  // alongside the SQL check: this avoids writing a junk cookie at all.
  const { data: memberships, error } = await supabase.rpc("contractor_memberships");
  if (error) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  if (!(memberships as string[] | null)?.includes(contractorId)) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("contractor", contractorId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
