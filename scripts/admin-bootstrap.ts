#!/usr/bin/env tsx
/**
 * Grants operator admin access by setting `app_metadata.is_admin` on a user.
 *
 * Without this, /admin is unreachable by anyone — including its author.
 * The guard reads app_metadata (not user_metadata) precisely because
 * app_metadata can only be set with the service-role key, which is what
 * makes the flag non-self-escalatable from the browser.
 *
 * Usage:
 *   npm run admin:bootstrap -- ops@crewcatch.ai
 *   npm run admin:bootstrap -- ops@crewcatch.ai --revoke
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
 * environment. The service-role key bypasses RLS and must never reach a
 * client bundle — this script is server-side only.
 */

import { createClient } from "@supabase/supabase-js";

const REVOKE = "--revoke";

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes(REVOKE);
  const email = args.find((a) => !a.startsWith("--"));

  if (!email) {
    console.error(
      "Usage: npm run admin:bootstrap -- <email> [--revoke]",
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) fail("NEXT_PUBLIC_SUPABASE_URL is not set. Copy .env.example to .env.local.");
  if (!serviceKey) {
    fail(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Find it in Supabase → Project Settings → API. " +
        "It bypasses RLS — keep it out of git and out of any client-side code.",
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Paginate: a project with more users than one page would otherwise miss the
  // target silently and report "not found" for an account that exists.
  let target: { id: string; email?: string } | undefined;
  for (let page = 1; page <= 10 && !target; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Could not list users: ${error.message}`);
    target = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!data.users.length) break;
  }

  if (!target) {
    fail(
      `No account found for ${email}.\n` +
        `  Create the user first: the customer signs up via magic link at /login,\n` +
        `  or an operator can add them in Supabase → Authentication → Users.`,
    );
  }

  // Preserve any other app_metadata already set on the account.
  const { data: existing, error: readError } = await admin.auth.admin.getUserById(target.id);
  if (readError) fail(`Could not read user metadata: ${readError.message}`);

  const appMetadata = { ...(existing.user?.app_metadata ?? {}) };
  if (revoke) {
    delete appMetadata.is_admin;
  } else {
    appMetadata.is_admin = true;
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(target.id, {
    app_metadata: appMetadata,
  });

  if (updateError) fail(`Could not update user: ${updateError.message}`);

  console.log(
    revoke
      ? `\n✓ Revoked admin access for ${email}.\n`
      : `\n✓ ${email} is now an operator. /admin is reachable on their next request.\n` +
        `  They may need to sign out and back in for the session to refresh.\n`,
  );
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
