import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. BYPASSES RLS.
 *
 * ⚠ Confined to the ingestion path (webhooks writing inbound calls). It must
 * never be used to render a page a contractor looks at — doing so would return
 * every tenant's rows in one query, since RLS is off for this key.
 *
 * This client deliberately has no cookie handling: there is no session to
 * carry, which makes accidental use in a render path more obvious.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "The admin client is only needed for webhook ingestion; the portal uses the RLS-scoped client.",
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
