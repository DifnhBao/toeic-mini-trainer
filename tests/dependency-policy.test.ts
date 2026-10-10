import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessDependencyAudit, type AuditReport } from "../scripts/lib/dependency-policy.mts";

const url = "https://github.com/advisories/reviewed";
const report: AuditReport = { auditReportVersion: 2, vulnerabilities: {
  tool: { severity: "high", via: ["leaf"], nodes: ["node_modules/tool"] },
  leaf: { severity: "high", via: [{ url, severity: "high" }], nodes: ["node_modules/leaf"] },
} };
const lock = { packages: { "node_modules/tool": { dev: true }, "node_modules/leaf": { dev: true } } };
const exceptions = { web: [{ url, expiresOn: "2026-10-22", devOnly: true, reason: "Trusted tooling only" }] };
const date = new Date("2026-10-08T00:00:00Z");

describe("dependency release gate", () => {
  it("accepts only reviewed unexpired tooling advisories, including transitive parents", () => {
    const result = assessDependencyAudit(report, lock, exceptions, "web", date);
    assert.deepEqual(result.errors, []); assert.equal(result.accepted.length, 1);
  });
  it("blocks unknown advisories and escalation to critical", () => {
    assert.ok(assessDependencyAudit(report, lock, {}, "web", date).errors.length);
    const changed = structuredClone(report); changed.vulnerabilities.leaf.severity = "critical";
    assert.ok(assessDependencyAudit(changed, lock, exceptions, "web", date).errors.length);
  });
  it("accepts legitimate dependency cycles only when they resolve to reviewed leaves", () => {
    const changed = structuredClone(report); changed.vulnerabilities.leaf.via.push("tool");
    assert.deepEqual(assessDependencyAudit(changed, lock, exceptions, "web", date).errors, []);
  });
  it("blocks expired exceptions and dependencies moving into production", () => {
    assert.ok(assessDependencyAudit(report, lock, exceptions, "web", new Date("2026-10-23")).errors.length);
    const changed = structuredClone(lock); changed.packages["node_modules/leaf"].dev = false;
    assert.ok(assessDependencyAudit(report, changed, exceptions, "web", date).errors.length);
  });
  it("fails closed when registry evidence or dependency references are invalid", () => {
    assert.ok(assessDependencyAudit({ ...report, error: {} }, lock, exceptions, "web", date).errors.length);
    const changed = structuredClone(report); changed.vulnerabilities.leaf.via = ["tool"];
    assert.ok(assessDependencyAudit(changed, lock, exceptions, "web", date).errors.length);
  });
});
