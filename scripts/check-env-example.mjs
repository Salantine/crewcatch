#!/usr/bin/env node
/**
 * Fails if `.env.example` contains real values.
 *
 * This exists because it happened: a real project URL and a **service-role
 * key** were pasted into the template. Nothing caught it. `.env*` is
 * gitignored, so the file happened to be untracked and the key was not
 * pushed — but that was luck, not a control. The next `git add .` on a
 * different setup would have committed a key that bypasses RLS and reads
 * every contractor's data.
 *
 * The template is the one file that must be safe to commit, because it is
 * the one file people copy FROM.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const EXAMPLE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".env.example",
);

/** Keys whose value may legitimately be a non-secret constant. */
const ALLOWED_NON_EMPTY = new Set([
  "INTEGRATION_MODE",
  "RETELL_SIGNATURE_HEADER",
]);

/** Substrings that indicate a credential regardless of which key holds it. */
const SECRET_SHAPES = [
  { label: "Supabase legacy JWT", pattern: /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/ },
  { label: "Supabase publishable key", pattern: /^sb_publishable_[A-Za-z0-9_-]+$/ },
  { label: "Supabase secret key", pattern: /^sb_secret_[A-Za-z0-9_-]+$/ },
  { label: "Twilio SID", pattern: /^AC[a-f0-9]{32}$/ },
  { label: "Twilio auth token", pattern: /^[a-f0-9]{32}$/ },
  { label: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

let raw;
try {
  raw = await readFile(EXAMPLE, "utf8");
} catch {
  console.error("✗ .env.example is missing.");
  process.exit(1);
}

const problems = [];

for (const [index, line] of raw.split("\n").entries()) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;

  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;

  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");

  if (value === "") continue;
  if (ALLOWED_NON_EMPTY.has(key)) continue;

  for (const { label, pattern } of SECRET_SHAPES) {
    if (pattern.test(value)) {
      problems.push(`  line ${index + 1}: ${key} looks like a ${label}`);
      break;
    }
  }

  // A .supabase.co host in the template is a real project reference.
  if (/supabase\.co/.test(value)) {
    problems.push(`  line ${index + 1}: ${key} points at a real Supabase project`);
  }
}

if (problems.length > 0) {
  console.error("✗ .env.example contains real values:");
  console.error(problems.join("\n"));
  console.error(
    "\n  Put real credentials in .env.local (gitignored), not in the template.",
  );
  process.exit(1);
}

console.log("✓ .env.example contains no real values.");
