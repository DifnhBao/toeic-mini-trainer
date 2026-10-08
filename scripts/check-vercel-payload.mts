import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const report = JSON.parse(readFileSync(resolve(root, process.argv[2] ?? "Test/vercel-deploy-dry.json"), "utf8"));
if (!Array.isArray(report.files) || !report.files.length) throw new Error("Vercel dry-run file manifest is missing.");
const files: string[] = report.files.filter((file: { mode: number }) => file.mode !== 16822)
  .map((file: { path: string }) => file.path.replaceAll("\\", "/"));
const tracked = spawnSync("git", ["ls-files", "-z", "app", "types", "prisma"], { cwd: root, encoding: "utf8", windowsHide: true });
if (tracked.error || tracked.status !== 0) throw new Error("Cannot verify tracked application sources.");
const expected = tracked.stdout.split("\0").filter(Boolean);
if (!expected.length) throw new Error("No tracked application sources found.");
const missing = expected.filter((path) => !files.includes(path));
const excluded = files.filter((path) => /(?:^|\/)\.env[^/]*$|^(?:Test|mobile|node_modules|\.next|\.git|public\/uploads|tests|docs|scripts)\/|\.(?:apk|aab|pem|key|jks|p12)$/.test(path));
if (missing.length || excluded.length) {
  throw new Error(`Invalid deployment payload. Missing application files: ${missing.join(", ")}. Excluded files present: ${excluded.join(", ")}.`);
}
console.log(`Vercel payload verified: ${files.length} files; all ${expected.length} tracked app/types/prisma files included; no excluded files.`);
