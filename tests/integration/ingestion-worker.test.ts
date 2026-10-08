import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { ExtractedData } from "../../app/lib/question-import";
import { SignJWT } from "jose";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") throw new Error("Explicit isolated integration database required");
const target = new URL(testUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.pathname !== "/toeic_release_test" || target.searchParams.get("sslmode") !== "disable" || [...target.searchParams.keys()].some(key => key !== "sslmode") || process.env.NODE_ENV === "production") {
  throw new Error("Only isolated local toeic_release_test with sslmode=disable accepted");
}
process.env.DATABASE_URL = testUrl;
process.env.GEMINI_API_KEY = "integration-placeholder-no-provider-calls";
process.env.MOBILE_JWT_SECRET = "worker-race-integration-secret-never-deployed";
let prisma: PrismaClient;
let ingestion: typeof import("../../app/lib/toeic-ingestion");
let capacity: typeof import("../../app/lib/ai-provider-capacity");
let getJob: typeof import("../../app/api/v1/ingestions/[id]/route");
const owner = randomUUID(), asset = randomUUID();
const jobs = new Set<string>();
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function result(label: string): ExtractedData {
  return { data: [{ questions: [{ part: 5, content: label, options: { A: "a", B: "b", C: "c", D: "d" }, correctAnswer: "A" }] }] };
}
before(async () => {
  prisma = (await import("../../app/lib/prisma")).prisma;
  ingestion = await import("../../app/lib/toeic-ingestion");
  capacity = await import("../../app/lib/ai-provider-capacity");
  getJob = await import("../../app/api/v1/ingestions/[id]/route");
  await prisma.user.create({ data: { id: owner, email: `${owner}@worker-race.invalid`, role: "ADMIN" } });
  await prisma.uploadedAsset.create({ data: { id: asset, ownerId: owner, kind: "DOCUMENT", status: "READY", objectKey: `worker-race/${asset}`, originalName: "synthetic.pdf", contentType: "application/pdf", sizeBytes: 3 } });
});
after(async () => {
  if (!prisma) return;
  await prisma.ingestionJob.deleteMany({ where: { id: { in: [...jobs] } } });
  await prisma.uploadedAsset.deleteMany({ where: { id: asset } });
  await prisma.user.deleteMany({ where: { id: owner } });
  await prisma.$disconnect();
});
async function job(attemptCount = 0) {
  const id = randomUUID(); jobs.add(id);
  await prisma.ingestionJob.create({ data: { id, ownerId: owner, documentAssetId: asset, attemptCount } });
  return id;
}
function run(id: string, extract: () => Promise<ExtractedData>) {
  return ingestion.processIngestionJob(id, { database: prisma, readDocument: async () => Buffer.from("pdf"), extract });
}
async function retryWhileOldWorkerIsAlive(id: string) {
  const old = await prisma.ingestionJob.findUniqueOrThrow({ where: { id } });
  assert.equal(old.status, "PROCESSING"); assert.equal(old.attemptCount, 1);
  // Simulate a timed-out invocation and the existing explicit retry transition.
  // No sleeps, provider calls, or changes to real jobs are needed.
  await prisma.ingestionJob.update({ where: { id }, data: { status: "FAILED", errorCode: "WORKER_TIMEOUT", completedAt: new Date() } });
  await prisma.ingestionJob.update({ where: { id }, data: { status: "PENDING", startedAt: null, completedAt: null, errorCode: null } });
}

describe("ingestion worker ownership after timeout and retry", () => {
  for (const imported of [false, true]) {
    it(`discards an old successful worker after its replacement ${imported ? "has been imported" : "completes"}`, async () => {
      const id = await job(); const entered = deferred<void>(); const oldResult = deferred<ExtractedData>();
      const old = run(id, () => { entered.resolve(); return oldResult.promise; });
      try {
        await entered.promise; await retryWhileOldWorkerIsAlive(id);
        const currentResult = result("Replacement reviewed result");
        await run(id, async () => currentResult);
        if (imported) await prisma.ingestionJob.update({ where: { id }, data: { status: "IMPORTED", importedAt: new Date() } });
        const current = await prisma.ingestionJob.findUniqueOrThrow({ where: { id } });
        oldResult.resolve(result("Obsolete result must not overwrite")); await old;
        const actual = await prisma.ingestionJob.findUniqueOrThrow({ where: { id } });
        assert.equal(actual.status, imported ? "IMPORTED" : "COMPLETED");
        assert.deepEqual(actual.result, currentResult);
        assert.equal(actual.attemptCount, 2);
        assert.equal(actual.updatedAt.getTime(), current.updatedAt.getTime());
        assert.equal(actual.importedAt?.getTime(), current.importedAt?.getTime());
      } finally { oldResult.resolve(result("Release fixture")); await old; }
    });
  }
  for (const busy of [false, true]) {
    it(`does not let an old ${busy ? "busy" : "failed"} worker alter a running replacement`, async () => {
      const id = await job(); const oldEntered = deferred<void>(); const oldResult = deferred<ExtractedData>();
      const newEntered = deferred<void>(); const newResult = deferred<ExtractedData>();
      const old = run(id, () => { oldEntered.resolve(); return oldResult.promise; });
      let replacement: Promise<void> | undefined;
      try {
        await oldEntered.promise; await retryWhileOldWorkerIsAlive(id);
        replacement = run(id, () => { newEntered.resolve(); return newResult.promise; });
        await newEntered.promise;
        const current = await prisma.ingestionJob.findUniqueOrThrow({ where: { id } });
        oldResult.reject(busy ? new capacity.AiCapacityError("AI_BUSY", 30) : new Error("Synthetic old failure"));
        await old;
        const actual = await prisma.ingestionJob.findUniqueOrThrow({ where: { id } });
        assert.equal(actual.status, "PROCESSING"); assert.equal(actual.attemptCount, 2);
        assert.equal(actual.startedAt?.getTime(), current.startedAt?.getTime());
        assert.equal(actual.updatedAt.getTime(), current.updatedAt.getTime());
        assert.equal(actual.errorCode, null);
      } finally {
        oldResult.resolve(result("Release old fixture")); newResult.resolve(result("Replacement result"));
        await Promise.allSettled([old, ...(replacement ? [replacement] : [])]);
      }
    });
  }
  it("never starts document/provider work after the three-attempt cap", async () => {
    const id = await job(3); let reads = 0, extracts = 0;
    await ingestion.processIngestionJob(id, { database: prisma, readDocument: async () => { reads++; return Buffer.from("pdf"); }, extract: async () => { extracts++; return result("Must not run"); } });
    assert.equal(reads, 0); assert.equal(extracts, 0);
    assert.equal((await prisma.ingestionJob.findUniqueOrThrow({ where: { id } })).attemptCount, 3);
  });
  it("does not let a stale polling snapshot time out a fresh replacement", async () => {
    const id = await job(1);
    await prisma.ingestionJob.update({ where: { id }, data: { status: "PROCESSING", startedAt: new Date(Date.now() - 7 * 60_000) } });
    const token = await new SignJWT({ tokenUse: "access" }).setProtectedHeader({ alg: "HS256" }).setSubject(owner)
      .setIssuer("toeic-mini-trainer").setAudience("toeic-mobile").setExpirationTime("5m")
      .sign(new TextEncoder().encode(process.env.MOBILE_JWT_SECRET));
    const snapshotRead = deferred<void>(), releaseRead = deferred<void>();
    const newEntered = deferred<void>(), newResult = deferred<ExtractedData>();
    const original = prisma.ingestionJob.findFirst;
    let intercept = true;
    // Pause only the first real DB read so the route resumes with an obsolete
    // snapshot. Writes, auth and subsequent reads still use real PostgreSQL.
    prisma.ingestionJob.findFirst = (async (...args: Parameters<typeof original>) => {
      const value = await original(...args);
      if (intercept) { intercept = false; snapshotRead.resolve(); await releaseRead.promise; }
      return value;
    }) as typeof original;
    const reading = getJob.GET(new Request(`https://integration.invalid/api/v1/ingestions/${id}`, { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ id }) });
    let replacement: Promise<void> | undefined;
    try {
      await snapshotRead.promise; await retryWhileOldWorkerIsAlive(id);
      replacement = run(id, () => { newEntered.resolve(); return newResult.promise; });
      await newEntered.promise; releaseRead.resolve();
      const response = await reading;
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.job.status, "PROCESSING"); assert.equal(payload.job.attemptCount, 2);
      assert.equal(payload.job.errorCode, null); assert.equal(payload.job.result, null);
      assert.equal((await prisma.ingestionJob.findUniqueOrThrow({ where: { id } })).status, "PROCESSING");
    } finally {
      prisma.ingestionJob.findFirst = original; releaseRead.resolve(); newResult.resolve(result("Replacement after polling"));
      await Promise.allSettled([reading, ...(replacement ? [replacement] : [])]);
    }
  });
});
