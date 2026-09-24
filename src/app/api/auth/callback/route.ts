import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/auth/redirect";

/**
 * Magic-link callback. Exchanges the one-time code for a session, then sends
 * the user to their original destination.
 *
 * The `next` value is read from the query string and used to build a redirect
 * — it MUST be validated as a same-origin relative path. Passing it straight
 * to `new URL()` would turn this into an open redirect: an attacker could send
 * a victim a legitimate-looking CrewCatch link that bounces them to a phishing
 * site after they authenticate.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  const safeNext = safeRedirectPath(next);

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] code exchange failed:", error.message);
    return NextResponse.redirect(new URL("/login?error=exchange_failed", origin));
  }

  return NextResponse.redirect(new URL(safeNext, origin));
}
