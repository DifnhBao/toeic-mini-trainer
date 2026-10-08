type Advisory = { url?: string; severity?: string };
type Vulnerability = { severity: string; via: Array<string | Advisory>; nodes: string[] };
export type AuditReport = { auditReportVersion: number; error?: unknown; vulnerabilities: Record<string, Vulnerability> };
export type DependencyExceptions = Record<string, Array<{ url: string; expiresOn: string; devOnly: boolean; reason: string }>>;
type Lockfile = { packages: Record<string, { dev?: boolean }> };

export function assessDependencyAudit(
  report: AuditReport, lock: Lockfile, exceptions: DependencyExceptions,
  project: string, now = new Date(),
) {
  const errors: string[] = [];
  const accepted = new Set<string>();
  if (report.error || report.auditReportVersion !== 2 || !report.vulnerabilities || !lock.packages) {
    return { errors: ["Audit or lockfile is missing/invalid."], accepted: [] };
  }
  function advisories(name: string, ancestors = new Set<string>()): Advisory[] {
    const item = report.vulnerabilities[name];
    // npm reports legitimate dependency cycles (React Native/Metro). Each
    // severe entry must still resolve to at least one reviewed leaf advisory.
    if (ancestors.has(name)) return [];
    if (!item || !Array.isArray(item.via)) {
      errors.push(`Invalid advisory dependency: ${name}`); return [];
    }
    const next = new Set(ancestors).add(name);
    return item.via.flatMap((via) => typeof via === "string" ? advisories(via, next) : [via]);
  }
  for (const [name, item] of Object.entries(report.vulnerabilities)) {
    if (!["high", "critical"].includes(item.severity)) continue;
    if (item.severity === "critical") { errors.push(`${name}: critical advisory blocks release.`); continue; }
    const sources = advisories(name);
    if (!sources.length) { errors.push(`${name}: no advisory evidence.`); continue; }
    for (const source of sources) {
      const exception = exceptions[project]?.find((entry) => entry.url === source.url);
      if (!exception || source.severity === "critical") {
        errors.push(`${name}: unreviewed advisory ${source.url || "unknown"}`); continue;
      }
      const expiry = /^\d{4}-\d{2}-\d{2}$/.test(exception.expiresOn)
        ? new Date(`${exception.expiresOn}T23:59:59.999Z`).getTime() : NaN;
      if (!Number.isFinite(expiry) || now.getTime() > expiry || !exception.reason.trim()) {
        errors.push(`${name}: exception expired or invalid.`); continue;
      }
      if (exception.devOnly && (!item.nodes?.length || item.nodes.some((node) => lock.packages[node]?.dev !== true))) {
        errors.push(`${name}: development-only exception reached production dependencies.`); continue;
      }
      accepted.add(`${source.url} (review by ${exception.expiresOn})`);
    }
  }
  return { errors: [...new Set(errors)], accepted: [...accepted] };
}
