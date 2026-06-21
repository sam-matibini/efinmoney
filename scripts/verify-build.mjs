/**
 * Fail the build if index.html references missing asset chunks.
 * Prevents deploying a broken main/chunk mismatch to production.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const indexPath = join(dist, "index.html");

if (!existsSync(indexPath)) {
  console.error("verify-build: dist/index.html not found — run vite build first");
  process.exit(1);
}

const html = readFileSync(indexPath, "utf8");
const refs = [...html.matchAll(/\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g)].map((m) => m[0]);
const unique = [...new Set(refs)];

const missing = unique.filter((ref) => !existsSync(join(dist, ref.replace(/^\//, ""))));

if (missing.length > 0) {
  console.error("verify-build: index.html references missing files:");
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

console.log(`verify-build: OK (${unique.length} asset refs checked)`);
