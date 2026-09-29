import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IMPORT_STALE_MS, isStalledImport } from "../app/lib/ingestion-status";
import { ingestionErrorMessage, pollIngestionJob } from "../mobile/src/lib/ingestion-poll";

function apiError(status: number) {
  return Object.assign(new Error("Request failed"), { status });
}

describe("ingestion recovery", () => {
  it("explains scan, page range and AI failures without exposing provider details", () => {
    assert.match(ingestionErrorMessage("DOCUMENT_PAGE_RANGE_INVALID"), /Trang bắt đầu/);
    assert.match(ingestionErrorMessage("DOCUMENT_OCR_TOO_LARGE"), /scan/);
    assert.match(ingestionErrorMessage("AI_RATE_LIMITED"), /giới hạn/);
  });
  it("flags stale imports without pretending they completed", () => {
    const now = Date.now();
    const stale = { status: "IMPORTING", importedAt: null, updatedAt: new Date(now - IMPORT_STALE_MS - 1) };
    assert.equal(isStalledImport(stale, now), true);
    assert.equal(stale.status, "IMPORTING");
    assert.equal(isStalledImport({ ...stale, updatedAt: new Date(now) }, now), false);
    assert.equal(isStalledImport({ ...stale, status: "IMPORTED" }, now), false);
    assert.equal(isStalledImport({ ...stale, importedAt: new Date(now) }, now), false);
  });

  it("continues polling after a temporary network failure", async () => {
    let clock = 0;
    let reads = 0;
    let transientNotices = 0;
    const statuses: string[] = [];
    const completed = await pollIngestionJob({
      read: async () => {
        reads += 1;
        if (reads === 2) throw new TypeError("network unavailable");
        return { status: reads === 3 ? "COMPLETED" : "PROCESSING", errorCode: null };
      },
      onJob: (job) => statuses.push(job.status),
      onTransientError: () => { transientNotices += 1; },
      wait: async (ms) => { clock += ms; },
      now: () => clock,
    });
    assert.equal(completed.status, "COMPLETED");
    assert.deepEqual(statuses, ["PROCESSING", "COMPLETED"]);
    assert.equal(transientNotices, 1);
  });

  it("does not retry an authorization failure", async () => {
    let reads = 0;
    await assert.rejects(
      pollIngestionJob({
        read: async () => {
          reads += 1;
          throw apiError(401);
        },
        onJob: () => {},
        wait: async () => {},
      }),
      (error: unknown) => error instanceof Error && 'status' in error && error.status === 401,
    );
    assert.equal(reads, 1);
  });

  it("stops retrying after its deadline", async () => {
    let clock = 0;
    await assert.rejects(
      pollIngestionJob({
        read: async () => { throw apiError(503); },
        onJob: () => {},
        wait: async (ms) => { clock += ms; },
        now: () => clock,
        timeoutMs: 9_000,
      }),
      /5 phút/,
    );
    assert.ok(clock >= 9_000);
  });
});
