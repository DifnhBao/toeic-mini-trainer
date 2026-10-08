import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { PrismaClient } from "@prisma/client";

let usage: typeof import("../app/lib/ai-usage");
const counts = new Map<string, number>();
const prior = { AI_ENABLED: process.env.AI_ENABLED, INGESTION_ENABLED: process.env.INGESTION_ENABLED, AI_DAILY_GLOBAL_CALL_LIMIT: process.env.AI_DAILY_GLOBAL_CALL_LIMIT };
before(async () => {
  (global as unknown as { prisma: PrismaClient }).prisma = {
    userAiUsage: { upsert: async ({ where }: { where: { key: string } }) => {
      const count = (counts.get(where.key) ?? 0) + 1; counts.set(where.key, count); return { count };
    } },
  } as unknown as PrismaClient;
  usage = await import("../app/lib/ai-usage");
});
beforeEach(() => {
  counts.clear(); process.env.AI_ENABLED = "true"; process.env.INGESTION_ENABLED = "true";
  process.env.AI_DAILY_GLOBAL_CALL_LIMIT = "3";
});
after(() => {
  for (const [key, value] of Object.entries(prior)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("AI quotas and emergency switches", () => {
  it("bounds concurrent calls from different users by one app-wide ceiling", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => usage.consumeDailyAiCall(`user-${index}`, "coach", 20)));
    assert.equal(results.filter(Boolean).length, 3);
  });
  it("preserves per-user quota and does not reserve global calls for rejected users", async () => {
    assert.equal(await usage.consumeDailyAiCall("one", "explain", 1), true);
    assert.equal(await usage.consumeDailyAiCall("one", "explain", 1), false);
    assert.equal([...counts].find(([key]) => key.endsWith(":global:ai"))?.[1], 1);
  });
  it("counts ingestion jobs separately and provider attempts including retries", async () => {
    assert.equal(await usage.consumeDailyAiCall("one", "ingestion", 3), true);
    assert.equal([...counts.keys()].some((key) => key.endsWith(":global:ai")), false);
    assert.deepEqual(await Promise.all(Array.from({ length: 4 }, () => usage.consumeGlobalAiCall())), [true, true, true, false]);
  });
  it("does not call the database when disabled or misconfigured", async () => {
    process.env.AI_ENABLED = "false";
    assert.equal(await usage.consumeDailyAiCall("one", "coach", 20), false);
    assert.equal(await usage.consumeGlobalAiCall(), false);
    process.env.AI_ENABLED = "true"; process.env.INGESTION_ENABLED = "false";
    assert.equal(await usage.consumeDailyAiCall("one", "ingestion", 3), false);
    process.env.AI_DAILY_GLOBAL_CALL_LIMIT = "invalid";
    assert.equal(await usage.consumeDailyAiCall("one", "coach", 20), false);
    assert.equal(counts.size, 0);
  });
});
