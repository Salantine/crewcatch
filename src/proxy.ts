import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth gate for the portal. Runs the `proxy` convention (Next 16; the older
 * `middleware` filename is deprecated). The runtime here is Node.js — the edge
 * runtime is not supported in `proxy`.
 *
 * This does two jobs:
 *   1. Redirects unauthenticated requests away from the portal.
 *   2. Refreshes the auth cookie so Server Components see a current session.
 *      Without the refresh, a valid session would drop on navigation and the
 *      user would be bounced to the login page despite being signed in.
 */

const PUBLIC_ROUTES = ["/login", "/auth"];

function isPublic(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Portal routes are the ONLY thing behind auth. Everything else is public, so
 * this is an allowlist of what must be gated rather than a denylist of public
 * paths — a new marketing route stays public by default instead of
 * accidentally 307-ing the whole site.
 */
const PORTAL_ROUTES = ["/dashboard", "/calls", "/leads", "/prompts", "/settings"];

const isPortal = (pathname: string) =>
  PORTAL_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Supabase is optional for the public site. Without credentials the marketing
  // pages must still serve — otherwise an unconfigured local checkout 500s on
  // every route.
  //
  // With no Supabase project there is also no session to check and no database
  // to read, so the portal is reachable in DEMO mode: it renders generated
  // sample data behind a banner that says so. This cannot leak anything, because
  // there is nothing behind it. Redirecting to /login would leave the portal
  // impossible to inspect locally.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() revalidates with the auth server. getSession() would trust a
  // client-readable JWT without checking it, which is not a security check.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isPublic(pathname)) {
    // Already signed in and heading to login — send them to the portal.
    if (user && pathname === "/login") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return response;
  }

  if (isPortal(pathname) && !user) {
    const redirect = new URL("/login", request.url);
    redirect.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  // Everything except static assets and the webhook routes, which are
  // authenticated by signature rather than by session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/webhooks).*)"],
};
