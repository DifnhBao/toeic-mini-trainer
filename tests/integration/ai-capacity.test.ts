import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") throw new Error("Explicit isolated integration database required");
const parsed = new URL(testUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || parsed.pathname !== "/toeic_release_test" || process.env.NODE_ENV === "production") {
  throw new Error("Integration tests only accept the isolated local toeic_release_test database");
}
process.env.DATABASE_URL = testUrl;
process.env.AI_ENABLED = "true";
process.env.AI_MAX_CONCURRENT_CALLS = "3";
process.env.GEMINI_API_KEY = "integration-placeholder-no-network-provider";
const clients = [0, 1].map(() => new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: testUrl, max: 4 })) }));
const ownLeases = new Set<string>();
const userId = randomUUID(); const assetId = randomUUID(); const jobId = randomUUID();
let capacity: typeof import("../../app/lib/ai-provider-capacity");
let ingestion: typeof import("../../app/lib/toeic-ingestion");
before(async () => {
  capacity = await import("../../app/lib/ai-provider-capacity");
  ingestion = await import("../../app/lib/toeic-ingestion");
  await clients[0].user.create({ data: { id: userId, email: `${userId}@test.invalid` } });
  await clients[0].uploadedAsset.create({ data: {
    id: assetId, ownerId: userId, kind: "DOCUMENT", status: "READY", objectKey: `integration/${assetId}`,
    originalName: "fixture.pdf", contentType: "application/pdf", sizeBytes: 3,
  } });
  await clients[0].ingestionJob.create({ data: { id: jobId, ownerId: userId, documentAssetId: assetId } });
});
after(async () => {
  await clients[0].ingestionJob.deleteMany({ where: { id: jobId } });
  await clients[0].uploadedAsset.deleteMany({ where: { id: assetId } });
  await clients[0].user.deleteMany({ where: { id: userId } });
  await clients[0].userAiUsage.deleteMany({ where: { key: { in: [...ownLeases] } } });
  await Promise.all(clients.map((client) => client.$disconnect()));
  const { prisma } = await import("../../app/lib/prisma"); await prisma.$disconnect();
});
async function acquire(client = clients[0]) {
  const lease = await capacity.acquireAiProviderLease(45_000, client); ownLeases.add(lease.key); return lease;
}

describe("PostgreSQL AI capacity across independent clients", () => {
  it("admits exactly three out of twenty simultaneous requests", async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => acquire(clients[index % 2])));
    const admitted = results.filter((result) => result.status === "fulfilled");
    try {
      assert.equal(admitted.length, 3);
      for (const result of results) {
        if (result.status === "rejected") assert.ok(result.reason instanceof capacity.AiCapacityError && result.reason.code === "AI_BUSY");
      }
    } finally {
      // A failed assertion must not leave this test's permits active and turn
      // independent expiry/recovery checks into cascading AI_BUSY failures.
      await Promise.all(admitted.map((result) => result.status === "fulfilled" && result.value.release()));
    }
    assert.equal(await clients[1].userAiUsage.count({ where: { key: { in: [...ownLeases] } } }), 0);
  });
  it("reclaims expired permits and a late release cannot remove a replacement", async () => {
    const first = await acquire(); const second = await acquire(); const expired = await acquire();
    await clients[0].userAiUsage.update({ where: { key: expired.key }, data: { expiresAt: new Date(0) } });
    const replacement = await acquire(clients[1]);
    await expired.release();
    assert.ok(await clients[0].userAiUsage.findUnique({ where: { key: replacement.key } }));
    await assert.rejects(acquire(), (error) => error instanceof capacity.AiCapacityError && error.code === "AI_BUSY");
    await Promise.all([first.release(), second.release(), replacement.release()]);
  });
  it("keeps a busy ingestion pending without losing its upload or retry allowance", async () => {
    let busy = true; let reads = 0;
    const dependencies: NonNullable<Parameters<typeof ingestion.processIngestionJob>[1]> = {
      database: clients[0],
      readDocument: async () => { reads++; return Buffer.from("pdf"); },
      extract: async () => {
        if (busy) throw new capacity.AiCapacityError("AI_BUSY", 30);
        return { data: [{ questions: [{ part: 5, content: "Fixture", options: { A: "a", B: "b", C: "c", D: "d" }, correctAnswer: "A" }] }] };
      },
    };
    await ingestion.processIngestionJob(jobId, dependencies);
    const pending = await clients[1].ingestionJob.findUniqueOrThrow({ where: { id: jobId } });
    assert.equal(pending.status, "PENDING"); assert.equal(pending.attemptCount, 0);
    assert.equal(pending.startedAt, null); assert.equal(pending.completedAt, null); assert.equal(pending.errorCode, null);
    assert.equal(pending.documentAssetId, assetId);
    assert.equal((await clients[1].uploadedAsset.findUniqueOrThrow({ where: { id: assetId } })).status, "READY");
    busy = false;
    await Promise.all([ingestion.processIngestionJob(jobId, dependencies), ingestion.processIngestionJob(jobId, dependencies)]);
    const complete = await clients[1].ingestionJob.findUniqueOrThrow({ where: { id: jobId } });
    assert.equal(complete.status, "COMPLETED"); assert.equal(complete.attemptCount, 1);
    assert.ok(complete.result); assert.equal(reads, 2);
  });
});
