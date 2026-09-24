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

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  if (!user) {
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
