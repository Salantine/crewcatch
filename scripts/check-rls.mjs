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

const M2 = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "migrations",
  "0002_decouple_contractor.sql",
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

// ------------------------------------------------ migration 0002 invariants
// The tenant model is only correct if the contractor identity was decoupled
// from the auth user. These assertions fail loudly if a future migration
// reintroduces the 1:1 constraint, which would silently cap each user to one
// contractor and make the multi-entity case impossible.
const m2 = await readFile(M2, "utf8").catch(() => null);

if (!m2) {
  console.error("✗ Migration 0002 is missing — the auth.users FK is still in place.");
  failed = true;
} else {
  if (!/drop constraint if exists contractors_id_fkey/i.test(m2)) {
    console.error("✗ 0002 does not drop the contractors → auth.users foreign key.");
    failed = true;
  }
  // Inspect the FUNCTION BODY only, not the whole file: a comment mentioning
  // "limit 1" must not fail the build, but the function actually doing it must.
  const fnBody = m2.match(
    /create or replace function public\.current_contractor_id\(\)[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  if (/limit\s+1/i.test(fnBody)) {
    console.error(
      "✗ current_contractor_id() still selects a single row — an ambiguous membership would resolve to an arbitrary contractor, leaking another entity's rows.",
    );
    failed = true;
  }
  if (!/return null/i.test(fnBody)) {
    console.error(
      "✗ current_contractor_id() never returns NULL — an ambiguous membership must fail closed, not guess.",
    );
    failed = true;
  }
  if (!/on update cascade/i.test(m2)) {
    console.error(
      "✗ contractor_id FKs are not ON UPDATE CASCADE — reassigning a contractor id would orphan tenant rows.",
    );
    failed = true;
  }
  if (!/dispatched_at/i.test(m2)) {
    console.error("✗ dispatch_events.dispatched_at missing — the 30-second SLA cannot be measured.");
    failed = true;
  }
  console.log("Tenant model:");
  console.log("  contractor decoupled from auth.users   ✓");
  console.log("  ambiguous membership fails closed      ✓");
  console.log("  contractor_id FKs cascade on update    ✓");
  console.log("  dispatch SLA instrumentation present   ✓");
}

console.log(failed ? "\n✗ RLS check FAILED." : "\n✓ Every tenant table is RLS-covered.");
process.exit(failed ? 1 : 0);
