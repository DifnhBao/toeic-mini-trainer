import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Prisma } from "@prisma/client";

const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") throw new Error("Explicit isolated local database required");
const parsed = new URL(url);
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || parsed.pathname !== "/toeic_release_test" || process.env.NODE_ENV === "production") {
  throw new Error("Benchmark only accepts the isolated local toeic_release_test database");
}
process.env.DATABASE_URL = url;
const { prisma } = await import("../app/lib/prisma");
const { learningSummary, selectPracticeQuestions } = await import("../app/lib/learning-data");
const users = Array.from({ length: 20 }, () => ({ id: randomUUID(), testId: randomUUID() }));
const questions = Array.from({ length: 10_000 }, (_, index) => ({
  id: randomUUID(), ownerId: null, publicationStatus: "PUBLISHED" as const, part: index % 7 + 1,
  content: "Original synthetic local load fixture", options: { A: "a", B: "b", C: "c", D: "d" }, correctAnswer: "A",
}));
const selectedIds = questions.slice(0, 20).map((question) => question.id);
const correct = questions.slice(0, 20).filter((question) => question.part % 2 === 0).length;
try {
  await prisma.user.createMany({ data: users.map((user) => ({ id: user.id, email: `${user.id}@benchmark.invalid` })) });
  for (let index = 0; index < questions.length; index += 500) await prisma.question.createMany({ data: questions.slice(index, index + 500) });
  for (const user of users) {
    await prisma.miniTest.create({ data: { id: user.testId, createdById: user.id, title: "Local load fixture", questions: {
      create: selectedIds.map((questionId, orderIndex) => ({ questionId, orderIndex: orderIndex + 1 })),
    } } });
    await prisma.$executeRaw`
      INSERT INTO test_attempts (id, "userId", "testId", score, "durationSeconds", "completedAt")
      SELECT gen_random_uuid()::text, ${user.id}, ${user.testId}, ${correct}, 600, clock_timestamp()
      FROM generate_series(1, 1000)
    `;
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO user_answers (id, "attemptId", "questionId", "selectedOption", "isCorrect")
      SELECT gen_random_uuid()::text, t.id, q.id,
        CASE WHEN q.part % 2 = 0 THEN 'A' ELSE 'B' END, q.part % 2 = 0
      FROM test_attempts t CROSS JOIN questions q
      WHERE t."userId" = ${user.id} AND q.id IN (${Prisma.join(selectedIds)})
    `);
  }
  // Bulk fixtures need fresh planner statistics before measuring steady-state
  // query behavior. ANALYZE touches only this guarded local test database.
  await prisma.$executeRaw`ANALYZE questions, test_attempts, user_answers`;
  const explain = await prisma.$queryRaw<Array<{ "QUERY PLAN": Array<{ "Execution Time": number; Plan: unknown }> }>>`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT q.part, count(*) AS total, sum(CASE WHEN a."isCorrect" THEN 1 ELSE 0 END) AS correct
    FROM user_answers a JOIN test_attempts t ON t.id = a."attemptId"
    JOIN questions q ON q.id = a."questionId" WHERE t."userId" = ${users[0].id}
    GROUP BY q.part ORDER BY q.part
  `;
  const timings = { selection: [] as number[], summary: [] as number[] };
  for (const user of users) await learningSummary(user.id);
  await Promise.all(users.map(async (user) => {
    for (let iteration = 0; iteration < 10; iteration++) {
      let start = performance.now();
      const selected = await selectPracticeQuestions(user.id, [1, 2, 3, 4, 5, 6, 7], 20);
      timings.selection.push(performance.now() - start);
      assert.equal(selected.length, 20); assert.equal(new Set(selected.map((row) => row.id)).size, 20);
      start = performance.now();
      const summary = await learningSummary(user.id);
      timings.summary.push(performance.now() - start);
      assert.equal(summary.totalTests, 1000); assert.equal(summary.totalAnswered, 20_000);
      assert.equal(summary.overallAccuracy, correct * 5);
    }
  }));
  const stats = (values: number[]) => {
    values.sort((a, b) => a - b);
    return { calls: values.length, p50Ms: Number(values[Math.ceil(values.length * 0.5) - 1].toFixed(2)),
      p95Ms: Number(values[Math.ceil(values.length * 0.95) - 1].toFixed(2)), maximumMs: Number(values.at(-1)!.toFixed(2)) };
  };
  console.log(JSON.stringify({ questions: questions.length, concurrentUsers: users.length, attemptsPerUser: 1000,
    totalAnswers: 400_000, plannerStatistics: "ANALYZE after fixture creation",
    selection: stats(timings.selection), summary: stats(timings.summary), explainSummary: explain[0]["QUERY PLAN"][0],
    scope: "Local PostgreSQL/Prisma functions, excludes HTTP/auth/network/media/provider and production load" }, null, 2));
} finally {
  // Only fixture UUIDs created above can be deleted; never truncate/reset.
  await prisma.miniTest.deleteMany({ where: { id: { in: users.map((user) => user.testId) } } });
  await prisma.question.deleteMany({ where: { id: { in: questions.map((question) => question.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  const remaining = await prisma.question.count({ where: { id: { in: questions.map((question) => question.id) } } });
  await prisma.$disconnect();
  assert.equal(remaining, 0, "Load fixtures were not fully cleaned");
}
