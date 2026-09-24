import { NextResponse } from "next/server";
import { integrationMode } from "@/lib/integrations";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check.
 *
 * Reports configuration and reachability so an operator can see *why* the
 * pipeline is down without reading logs. A dispatch failure is invisible to
 * the contractor by construction — nobody notices a lead that never arrived —
 * so this endpoint is how an operator finds out.
 *
 * Returns 200 when the service can run, 503 when a required dependency is
 * missing. It does NOT report the absence of optional integrations as
 * unhealthy: a deployment with no Twilio credentials is a valid demo
 * environment, not an outage.
 */

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
}

export async function GET() {
  const checks: Check[] = [];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  checks.push({
    name: "supabase",
    ok: Boolean(supabaseUrl && serviceKey && anonKey),
    detail: supabaseUrl
      ? serviceKey && anonKey
        ? "configured"
        : "missing service-role or anon key"
      : "not configured (demo mode: no database writes, portal shows sample data)",
    required: false,
  });

  // Only probe the database when it is actually configured — otherwise this
  // reports a failure for a perfectly healthy mock deployment.
  if (supabaseUrl && serviceKey) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      const { error } = await admin.from("contractors").select("id").limit(1);
      checks.push({
        name: "database_reachable",
        ok: !error,
        detail: error ? error.message : "reachable",
        required: true,
      });
    } catch (err) {
      checks.push({
        name: "database_reachable",
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        required: true,
      });
    }
  }

  const mode = integrationMode();
  checks.push({
    name: "integration_mode",
    ok: true,
    detail: mode,
    required: false,
  });

  if (mode === "live") {
    const missing = [
      ["TWILIO_ACCOUNT_SID", process.env.TWILIO_ACCOUNT_SID],
      ["RETELL_WEBHOOK_SECRET", process.env.RETELL_WEBHOOK_SECRET],
      ["MAKE_SCENARIO_WEBHOOK_URL", process.env.MAKE_SCENARIO_WEBHOOK_URL],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k);

    checks.push({
      name: "live_credentials",
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? "all present"
          : `missing: ${missing.join(", ")}`,
      required: true,
    });
  }

  const healthy = checks.filter((c) => c.required).every((c) => c.ok);
  const degraded = checks.some((c) => !c.ok);

  log.info("health check", { healthy, degraded, checks: checks.length });

  return NextResponse.json(
    {
      status: healthy ? (degraded ? "degraded" : "ok") : "unhealthy",
      mode,
      checks,
      ts: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
