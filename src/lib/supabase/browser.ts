"use client";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Public credentials only — the anon key is
 * designed to be visible to users, and RLS is what protects the data.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
