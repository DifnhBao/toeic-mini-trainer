import assert from "node:assert/strict";
import { mock, test } from "node:test";

test("worker failure pairs job and triggering request IDs without serializing provider errors", async () => {
  // Dummy configuration only. The injected dependencies never open a DB or call a provider.
  process.env.GOOGLE_API_KEY = "local-test-placeholder";
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/toeic_release_test";
  const { processIngestionJob } = await import("../app/lib/toeic-ingestion");
  const requestId = "11111111-1111-4111-8111-111111111111";
  const jobId = "22222222-2222-4222-8222-222222222222";
  const secret = "DO_NOT_LOG_signed_url_provider_metadata";
  const captured: unknown[][] = [];
  const writes: unknown[] = [];
  const logger = mock.method(console, "error", (...args: unknown[]) => { captured.push(args); });
  const network = mock.method(globalThis, "fetch", () => { throw new Error("Network forbidden in worker unit test"); });
  const dependencies = {
    database: { ingestionJob: {
      updateManyAndReturn: async () => [{ startedAt: new Date(), attemptCount: 1 }],
      findUnique: async () => ({ documentAsset: { status: "READY", kind: "DOCUMENT", objectKey: "fake.pdf" },
        audioAsset: null, audioAssetId: null, pageStart: 1, pageEnd: 4 }),
      updateMany: async (args: unknown) => { writes.push(args); return { count: 1 }; },
    } },
    readDocument: async () => Buffer.from("fake"),
    extract: async () => { throw Object.assign(new Error(secret), { $response: { body: secret } }); },
  } as unknown as NonNullable<Parameters<typeof processIngestionJob>[1]>;
  try {
    await processIngestionJob(jobId, dependencies, requestId);
    assert.equal(captured.length, 1);
    assert.equal(captured[0][0], "ingestion job failed");
    assert.deepEqual(captured[0][1], { jobId, requestId, errorType: "Error" });
    assert.ok(!JSON.stringify(captured).includes(secret));
    assert.equal(network.mock.callCount(), 0);
    assert.equal(writes.length, 1);
    assert.equal((writes[0] as { data: { errorCode: string } }).data.errorCode, "INGESTION_FAILED");
  } finally { logger.mock.restore(); network.mock.restore(); }
});
