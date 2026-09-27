import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertDemoSeedAllowed } from "../prisma/seed-policy";

const safeInput = {
  nodeEnv: "development",
  allowDemoSeed: "true",
  confirmedDatabaseName: "toeic_test",
  databaseUrl: "postgresql://user:password@localhost:5432/toeic_test",
};

describe("demo seed guard", () => {
  it("accepts only an explicitly confirmed test database", () => {
    assert.doesNotThrow(() => assertDemoSeedAllowed(safeInput));
  });

  it("rejects production even with all opt-in flags", () => {
    assert.throws(() => assertDemoSeedAllowed({ ...safeInput, nodeEnv: "production" }));
  });

  it("rejects a real database name and mismatched confirmation", () => {
    assert.throws(() => assertDemoSeedAllowed({ ...safeInput, databaseUrl: "postgresql://user:password@localhost:5432/toeic" }));
    assert.throws(() => assertDemoSeedAllowed({ ...safeInput, confirmedDatabaseName: "other_test" }));
  });

  it("rejects missing explicit permission", () => {
    assert.throws(() => assertDemoSeedAllowed({ ...safeInput, allowDemoSeed: undefined }));
  });
});
