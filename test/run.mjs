/**
 * Test runner for AI Creator Digest.
 *
 * Runs every offline suite in its own process, so one suite's global fetch
 * stub or environment variables can't leak into the next. Exits non-zero if
 * any suite fails, which is the whole point: the preview-fidelity check in
 * review-app is a standing guard, and a guard that doesn't fail the build
 * isn't one.
 *
 *   npm test              all offline suites
 *   npm run test:live     the one suite that calls YouTube for real
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

const SUITES = [
  ["pipeline", "markdown builders, slugs, index merging, feed and sitemap"],
  ["render", "front-end frontmatter parsing and row renderers"],
  ["social-links", "links come only from the description, never from the model"],
  ["approval-flow", "analyze, notify, publish as-is, reject"],
  ["review-app", "the Mini App: load, edit, preview, publish — and preview/publish byte identity"],
  ["webapp-auth", "Telegram initData verification and preview tokens"],
];

function runSuite(name) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--import", path.join(here, "helpers", "register.mjs"), path.join(here, `${name}.test.mjs`)],
      { env: { ...process.env, SITE_URL: process.env.SITE_URL || "https://aicreatordigest.com" } }
    );

    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ name, code, out }));
  });
}

const results = [];
for (const [name] of SUITES) {
  process.stdout.write(`  ${name} … `);
  const result = await runSuite(name);
  results.push(result);
  console.log(result.code === 0 ? "ok" : "FAILED");
}

const failed = results.filter((r) => r.code !== 0);

for (const r of failed) {
  console.log(`\n${"─".repeat(60)}\n${r.name} output:\n${"─".repeat(60)}\n${r.out}`);
}

console.log(
  `\n${results.length - failed.length}/${results.length} suites passed` +
    (failed.length ? `  (failed: ${failed.map((f) => f.name).join(", ")})` : "")
);

process.exit(failed.length ? 1 : 0);
