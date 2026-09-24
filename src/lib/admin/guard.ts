import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin authorization.
 *
 * `/admin` provisions phones, writes prompt profiles, and reads data through
 * the service-role client — which bypasses RLS entirely. Getting this wrong
 * means any authenticated contractor can read every other contractor's leads.
 *
 * Two rules:
 *
 *  1. Admin status comes from `app_metadata`, NOT `user_metadata`. Supabase
 *     user_metadata is writable by the user from the client; app_metadata is
 *     only settable with the service role. Checking user_metadata would let a
 *     contractor promote themselves with one `updateUser` call.
 *
 *  2. The check lives in a function that both the proxy and the admin layout
 *     call. The proxy alone is a routing convenience, not an authorization
 *     boundary — a request that bypasses it (direct function invocation, a
 *     future route added outside the matcher) must still be refused.
 */

export interface AdminIdentity {
  isAdmin: boolean;
  userId: string | null;
  email: string | null;
}

export async function getAdminIdentity(): Promise<AdminIdentity> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { isAdmin: false, userId: null, email: null };
    }

    // app_metadata only: not user-writable, so this cannot be self-escalated.
    const isAdmin = user.app_metadata?.is_admin === true;

    return { isAdmin, userId: user.id, email: user.email ?? null };
  } catch {
    // Fail closed. An unreachable auth service must not read as "is admin".
    return { isAdmin: false, userId: null, email: null };
  }
}
