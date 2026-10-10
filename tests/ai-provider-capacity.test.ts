import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { AiCapacityError, AiQuotaExceededError, withAiProviderCapacity } from "../app/lib/ai-provider-capacity";

const prior = { AI_ENABLED: process.env.AI_ENABLED, AI_MAX_CONCURRENT_CALLS: process.env.AI_MAX_CONCURRENT_CALLS };
beforeEach(() => { process.env.AI_ENABLED = "true"; process.env.AI_MAX_CONCURRENT_CALLS = "3"; });
after(() => {
  for (const [key, value] of Object.entries(prior)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

function fakeDatabase(active = 0, acquisitionFailure = false, releaseFailure = false) {
  let releases = 0;
  const database = {
    $transaction: async (run: (transaction: unknown) => Promise<void>) => {
      if (acquisitionFailure) throw new Error("database unavailable");
      await run({
        $executeRaw: async () => 1,
        $queryRaw: async (query: TemplateStringsArray) => query.join("").includes("count(*)")
          ? [{ active, retryAfterSeconds: 71 }] : [{ locked: 1 }],
      });
    },
    userAiUsage: { deleteMany: async () => { releases++; if (releaseFailure) throw new Error("release unavailable"); return { count: 1 }; } },
  } as unknown as PrismaClient;
  return { database, releases: () => releases };
}

describe("AI provider admission and deadlines", () => {
  it("sets one SDK attempt, passes cancellation and releases a successful call", async () => {
    const fake = fakeDatabase();
    const result = await withAiProviderCapacity({ timeoutMs: 100, allow: async () => true, generate: async (config) => {
      assert.deepEqual(config.httpOptions, { timeout: 100, retryOptions: { attempts: 1 } });
      assert.ok(config.abortSignal instanceof AbortSignal);
      return "answer";
    } }, fake.database);
    assert.equal(result, "answer"); assert.equal(fake.releases(), 1);
  });
  it("does not spend quota or call a provider when capacity is full", async () => {
    const fake = fakeDatabase(3); let quotas = 0; let calls = 0;
    await assert.rejects(withAiProviderCapacity({ timeoutMs: 100,
      allow: async () => { quotas++; return true; }, generate: async () => { calls++; },
    }, fake.database), (error) => error instanceof AiCapacityError && error.code === "AI_BUSY" && error.retryAfterSeconds === 71);
    assert.equal(quotas, 0); assert.equal(calls, 0); assert.equal(fake.releases(), 0);
  });
  it("releases unused capacity when daily quota rejects or its lookup fails", async () => {
    for (const fails of [false, true]) {
      const fake = fakeDatabase(); let calls = 0;
      await assert.rejects(withAiProviderCapacity({ timeoutMs: 100,
        allow: async () => { if (fails) throw new Error("quota unavailable"); return false; },
        generate: async () => { calls++; },
      }, fake.database), fails ? /quota unavailable/ : AiQuotaExceededError);
      assert.equal(calls, 0); assert.equal(fake.releases(), 1);
    }
  });
  it("fails closed for disabled, invalid configuration and database failure", async () => {
    for (const setting of ["disabled", "0", "invalid", "21", "database"]) {
      const fake = fakeDatabase(0, setting === "database"); let calls = 0;
      process.env.AI_ENABLED = setting === "disabled" ? "false" : "true";
      process.env.AI_MAX_CONCURRENT_CALLS = ["disabled", "database"].includes(setting) ? "3" : setting;
      await assert.rejects(withAiProviderCapacity({ timeoutMs: 100,
        allow: async () => true, generate: async () => { calls++; },
      }, fake.database), (error) => error instanceof AiCapacityError && error.code === "AI_CAPACITY_UNAVAILABLE");
      assert.equal(calls, 0);
    }
  });
  it("times out a stalled provider, aborts it and keeps its uncertain lease", async () => {
    const fake = fakeDatabase(); let signal: AbortSignal | undefined;
    await assert.rejects(withAiProviderCapacity({ timeoutMs: 20, allow: async () => true,
      generate: async (config) => { signal = config.abortSignal; return new Promise<never>(() => {}); },
    }, fake.database), (error) => error instanceof DOMException && error.name === "TimeoutError");
    assert.equal(signal?.aborted, true); assert.equal(fake.releases(), 0);
  });
  it("never starts the provider after a quota lookup exceeds the deadline", async () => {
    const fake = fakeDatabase(); let calls = 0; let resolveQuota!: (value: boolean) => void;
    await assert.rejects(withAiProviderCapacity({ timeoutMs: 20,
      allow: () => new Promise<boolean>((resolve) => { resolveQuota = resolve; }),
      generate: async () => { calls++; },
    }, fake.database), (error) => error instanceof DOMException && error.name === "TimeoutError");
    resolveQuota(true); await Promise.resolve();
    assert.equal(calls, 0); assert.equal(fake.releases(), 1);
  });
  it("keeps the lease after provider failure and preserves answers if release fails", async () => {
    const failure = fakeDatabase();
    await assert.rejects(withAiProviderCapacity({ timeoutMs: 100, allow: async () => true,
      generate: async () => { throw new Error("provider failed"); },
    }, failure.database), /provider failed/);
    assert.equal(failure.releases(), 0);
    const releaseFailure = fakeDatabase(0, false, true);
    assert.equal(await withAiProviderCapacity({ timeoutMs: 100, allow: async () => true,
      generate: async () => "completed answer",
    }, releaseFailure.database), "completed answer");
  });
});
