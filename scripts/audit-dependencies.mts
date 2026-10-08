import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessDependencyAudit, type AuditReport, type DependencyExceptions } from "./lib/dependency-policy.mts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const project = args[0] === "--project" && args.length === 2 ? args[1] : null;
if (!project || !["web", "mobile"].includes(project) || !process.env.npm_execpath) {
  throw new Error("Use npm run audit:dependencies -- --project web|mobile");
}
const projectRoot = project === "web" ? root : resolve(root, "mobile");
const result = spawnSync(process.execPath, [process.env.npm_execpath, "audit", "--json"], {
  cwd: projectRoot, encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024, windowsHide: true,
});
try {
  if (result.error || result.signal || ![0, 1].includes(result.status ?? -1)) throw new Error("Audit unavailable");
  const report = JSON.parse(result.stdout) as AuditReport;
  const lock = JSON.parse(readFileSync(resolve(projectRoot, "package-lock.json"), "utf8"));
  const exceptions = JSON.parse(readFileSync(resolve(root, "docs/dependency-exceptions.json"), "utf8")) as DependencyExceptions;
  const assessment = assessDependencyAudit(report, lock, exceptions, project);
  for (const accepted of assessment.accepted) console.warn(`REVIEWED TOOLING EXCEPTION: ${accepted}`);
  for (const error of assessment.errors) console.error(error);
  process.exitCode = assessment.errors.length ? 1 : 0;
  if (!assessment.errors.length) console.log(`${project}: no critical or unreviewed high advisories.`);
} catch {
  console.error("Dependency audit could not be verified; release check failed.");
  process.exitCode = 1;
}
