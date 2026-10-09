import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";

export async function selectPracticeQuestions(userId: string, parts: number[], count: number, preferUnseen = false) {
  // Sample in PostgreSQL: only the selected IDs cross the network. Every
  // client uses the same publication/ownership rules and unbiased DB shuffle.
  return prisma.$queryRaw<Array<{ id: string; part: number }>>(Prisma.sql`
    SELECT id, part FROM questions
    WHERE part IN (${Prisma.join(parts)})
      AND (("ownerId" IS NULL AND "publicationStatus" IN ('LEGACY', 'PUBLISHED'))
        OR ("ownerId" = ${userId} AND "publicationStatus" = 'PRIVATE'))
    ORDER BY ${preferUnseen ? Prisma.sql`EXISTS (
      SELECT 1 FROM user_answers ua JOIN test_attempts ta ON ta.id = ua."attemptId"
      WHERE ua."questionId" = questions.id AND ta."userId" = ${userId}
    ),` : Prisma.empty} random() LIMIT ${count}
  `);
}

// Keep the parameterized query shared with the local EXPLAIN/benchmark so
// performance evidence measures the same SQL that web and mobile execute.
export function learningSummaryQuery(userId: string) {
  return Prisma.sql`
    SELECT q.part, sum(a.total)::bigint AS total,
      sum(a.correct)::bigint AS correct
    FROM test_attempts t
    -- Aggregate within the correlated attempt before joining questions. This
    -- preserves repeated/skipped answers and enables the existing attemptId
    -- index instead of scanning every learner's answer history first.
    CROSS JOIN LATERAL (
      SELECT "questionId", count(*) AS total,
        sum(CASE WHEN "isCorrect" THEN 1 ELSE 0 END) AS correct
      FROM user_answers WHERE "attemptId" = t.id
      GROUP BY "questionId"
    ) a
    JOIN questions q ON q.id = a."questionId"
    WHERE t."userId" = ${userId}
    GROUP BY q.part ORDER BY q.part
  `;
}

export async function learningSummary(userId: string) {
  const [totalTests, rows] = await Promise.all([
    prisma.testAttempt.count({ where: { userId } }),
    prisma.$queryRaw<Array<{ part: number; total: bigint; correct: bigint }>>(learningSummaryQuery(userId)),
  ]);
  const totalAnswered = rows.reduce((sum, row) => sum + Number(row.total), 0);
  const totalCorrect = rows.reduce((sum, row) => sum + Number(row.correct), 0);
  return {
    totalTests, totalAnswered,
    overallAccuracy: totalAnswered ? Math.round(totalCorrect / totalAnswered * 100) : 0,
    partStats: rows.map((row) => ({
      part: row.part, total: Number(row.total), accuracy: Math.round(Number(row.correct) / Number(row.total) * 100),
    })),
  };
}
