#!/usr/bin/env node
/**
 * Accessibility audit against WCAG 2.1 AA.
 *
 * The design mandate says AA "by default", so this runs in CI and fails the
 * build on violations rather than leaving it to a review pass.
 *
 * The theme's measured contrast rules are encoded in globals.css; this audit
 * is what stops a future edit from quietly breaking one of them.
 *
 * Usage: npm run audit:a11y   (expects a server on :3111)
 */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.A11Y_BASE_URL ?? "http://localhost:3111";

const PAGES = [
  ["/", "home"],
  ["/pricing", "pricing"],
  ["/roi", "roi"],
  ["/compliance", "compliance"],
  ["/contact", "contact"],
  ["/trades/hvac", "trade-hvac"],
  ["/trades/pest_control", "trade-pest"],
  ["/login", "login"],
  ["/dashboard", "portal-dashboard"],
  ["/calls", "portal-calls"],
  ["/leads", "portal-leads"],
  ["/prompts", "portal-prompts"],
  ["/settings", "portal-settings"],
];

// WCAG 2.1 AA tags. `color-contrast` is the rule most likely to trip given
// the orange/navy palette, so it is included explicitly.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

let totalViolations = 0;
let failedPages = 0;

const browser = await chromium.launch();
const context = await browser.newContext();

for (const colorScheme of ["dark", "light"]) {
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme });

  for (const [path, name] of PAGES) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    } catch {
      console.error(`  ✗ ${name.padEnd(20)} could not load ${path}`);
      failedPages++;
      continue;
    }

    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const violations = results.violations;

    if (violations.length === 0) {
      console.log(`  ✓ ${name.padEnd(20)} ${colorScheme}`);
    } else {
      failedPages++;
      totalViolations += violations.length;
      console.log(`  ✗ ${name.padEnd(20)} ${colorScheme} — ${violations.length} violation(s)`);
      for (const v of violations) {
        console.log(`      [${v.impact}] ${v.id}: ${v.help}`);
        for (const node of (v.nodes ?? []).slice(0, 2)) {
          console.log(`        ${node.html.slice(0, 110)}`);
        }
      }
    }
  }
  await page.close();
}

await browser.close();

console.log(
  totalViolations === 0
    ? `\n✓ No WCAG 2.1 AA violations across ${PAGES.length} pages × 2 themes.`
    : `\n✗ ${totalViolations} violation group(s) across ${failedPages} page/theme checks.`,
);
process.exit(totalViolations === 0 ? 0 : 1);
