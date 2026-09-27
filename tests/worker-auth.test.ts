import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAuthorizedIngestionWorker,
  isIngestionWorkerConfigured,
} from "../app/lib/worker-auth";

const secret = "worker-secret-for-test-only-1234567890";

describe("ingestion worker authentication", () => {
  it("requires a long server-only secret", () => {
    assert.equal(isIngestionWorkerConfigured(""), false);
    assert.equal(isIngestionWorkerConfigured("too-short"), false);
    assert.equal(isIngestionWorkerConfigured(secret), true);
  });

  it("accepts only the exact bearer secret", () => {
    assert.equal(isAuthorizedIngestionWorker(`Bearer ${secret}`, secret), true);
    assert.equal(isAuthorizedIngestionWorker(`Bearer ${secret}x`, secret), false);
    assert.equal(isAuthorizedIngestionWorker(`Basic ${secret}`, secret), false);
    assert.equal(isAuthorizedIngestionWorker(null, secret), false);
    assert.equal(isAuthorizedIngestionWorker(`Bearer ${secret}`, "short"), false);
  });
});
