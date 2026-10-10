import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

// Fixed local fixture database only. Never read dotenv or DATABASE_URL as a fallback.
const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") throw new Error("Explicit local integration database opt-in required");
const parsed = new URL(url);
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
  || parsed.pathname !== "/toeic_release_test" || process.env.NODE_ENV === "production") {
  throw new Error("Benchmark accepts only the isolated local toeic_release_test database");
}
process.env.DATABASE_URL = url;
const { prisma } = await import("../app/lib/prisma");
const { selectPracticeQuestions } = await import("../app/lib/learning-data");
const ownerId = randomUUID();
const fixtureCount = 10_000;
const concurrency = 10;
const measuredCalls = 200;
try {
  await prisma.user.create({ data: { id: ownerId, email: `${ownerId}@benchmark.invalid` } });
  for (let offset = 0; offset < fixtureCount; offset += 500) {
    await prisma.question.createMany({ data: Array.from({ length: 500 }, (_, index) => ({
      id: randomUUID(), ownerId, part: (offset + index) % 7 + 1, content: "Synthetic local benchmark fixture",
      publicationStatus: "PRIVATE" as const, options: { A: "a", B: "b", C: "c", D: "d" }, correctAnswer: "A",
    })) });
  }
  for (let i = 0; i < 5; i++) await selectPracticeQuestions(ownerId, [5, 6, 7], 20);
  const measurements: number[] = [];
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
    for (let index = worker; index < measuredCalls; index += concurrency) {
      const before = performance.now();
      const selected = await selectPracticeQuestions(ownerId, [5, 6, 7], 20);
      measurements.push(performance.now() - before);
      assert.equal(selected.length, 20);
      assert.equal(new Set(selected.map((question) => question.id)).size, 20);
      assert.ok(selected.every((question) => [5, 6, 7].includes(question.part)));
    }
  }));
  const duration = performance.now() - started;
  measurements.sort((a, b) => a - b);
  const percentile = (value: number) => Number(measurements[Math.ceil(measurements.length * value) - 1].toFixed(2));
  console.log(JSON.stringify({ fixtureCount, concurrency, measuredCalls,
    p50Ms: percentile(0.5), p95Ms: percentile(0.95), maximumMs: Number(measurements.at(-1)!.toFixed(2)),
    callsPerSecond: Number((measuredCalls / (duration / 1000)).toFixed(2)),
    scope: "Local PostgreSQL query only; excludes API/auth/network/media/provider and production load",
  }, null, 2));
} finally {
  // The generated owner is the only deletion target; related fixtures cascade.
  await prisma.user.deleteMany({ where: { id: ownerId } });
  const remaining = await prisma.question.count({ where: { ownerId } });
  await prisma.$disconnect();
  assert.equal(remaining, 0, "Local benchmark fixtures were not fully cleaned");
}
