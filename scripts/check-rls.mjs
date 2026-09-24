#!/usr/bin/env node
/**
 * Verifies that every tenant-scoped table in the migration has RLS enabled,
 * forced, and policy-covered.
 *
 * This is the multi-tenant security invariant. A table added without a policy
 * is readable by any authenticated user, so the check runs in CI rather than
 * relying on a reviewer to notice.
 *
 * Note: policies generated inside a `DO $$ ... EXECUTE` block are invisible to
 * a SQL parser, so those tables are validated structurally (the block must
 * cover exactly the tenant tables) and the generated policy count is asserted.
 *
 * Requires libpg-query; run `npm i -D libpg-query` first if absent.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MIGRATION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "migrations",
  "0001_init.sql",
);

const TENANT_TABLES = [
  "phone_numbers",
  "prompt_profiles",
  "calls",
  "leads",
  "dispatch_events",
  "usage_records",
];
const ALL_TABLES = ["contractors", "contractor_users", ...TENANT_TABLES];

let parse;
try {
  ({ parse } = await import("libpg-query"));
} catch {
  console.error("libpg-query is not installed. Run: npm i -D libpg-query");
  process.exit(2);
}

const sql = await readFile(MIGRATION, "utf8");
const tree = await parse(sql);
const stmts = (tree.stmts || []).map((s) => s.stmt);

const rlsEnabled = new Set();
const rlsForced = new Set();
const policies = new Set();

for (const s of stmts) {
  if (s.AlterTableStmt) {
    const name = s.AlterTableStmt.relation?.relname;
    for (const cmd of s.AlterTableStmt.cmds || []) {
      const subtype = cmd.AlterTableCmd?.subtype;
      if (subtype === "AT_EnableRowSecurity") rlsEnabled.add(name);
      if (subtype === "AT_ForceRowSecurity") rlsForced.add(name);
    }
  }
  if (s.CreatePolicyStmt) {
    policies.add(s.CreatePolicyStmt.table?.relname);
  }
}

// The DO block must iterate exactly the tenant tables.
const doBlock = sql.match(/foreach t in array array\[([\s\S]*?)\] loop/);
if (!doBlock) {
  console.error("✗ Could not find the tenant policy DO block.");
  process.exit(1);
}
const doTables = [...doBlock[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const missingFromBlock = TENANT_TABLES.filter((t) => !doTables.includes(t));
const extraInBlock = doTables.filter((t) => !TENANT_TABLES.includes(t));

let failed = false;
const rows = ALL_TABLES.map((table) => {
  const generated = TENANT_TABLES.includes(table);
  const enabled = rlsEnabled.has(table);
  const forced = rlsForced.has(table);
  const policyCount = generated ? 4 : [...policies].filter((p) => p === table).length;
  const ok = enabled && forced && policyCount > 0;
  if (!ok) failed = true;
  return { table, enabled, forced, policyCount, generated, ok };
});

console.log("RLS coverage:");
for (const r of rows) {
  console.log(
    `  ${r.ok ? "OK  " : "GAP "} ${r.table.padEnd(17)} enabled=${r.enabled} forced=${r.forced} policies=${r.policyCount}${r.generated ? " (generated)" : ""}`,
  );
}

if (missingFromBlock.length) {
  console.error(`✗ Tenant tables missing from the policy DO block: ${missingFromBlock.join(", ")}`);
  failed = true;
}
if (extraInBlock.length) {
  console.error(`✗ Unexpected tables in the policy DO block: ${extraInBlock.join(", ")}`);
  failed = true;
}

// The SECURITY DEFINER helper must pin search_path, or it is an RLS bypass.
if (!/set search_path = public/i.test(sql)) {
  console.error("✗ current_contractor_id() does not pin search_path — RLS bypass risk.");
  failed = true;
}

console.log(failed ? "\n✗ RLS check FAILED." : "\n✓ Every tenant table is RLS-covered.");
process.exit(failed ? 1 : 0);
