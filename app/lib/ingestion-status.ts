// Longer than the 300-second Vercel function lifetime: a second request must
// never reclaim a job while the first import can still be running.
export const IMPORT_STALE_MS = 6 * 60_000;

export function isStalledImport(
  job: { status: string; importedAt: Date | null; updatedAt: Date },
  now = Date.now(),
) {
  return job.status === "IMPORTING" &&
    job.importedAt === null &&
    job.updatedAt.getTime() < now - IMPORT_STALE_MS;
}
