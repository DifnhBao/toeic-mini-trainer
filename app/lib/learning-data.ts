import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";

export async function selectPracticeQuestions(userId: string, parts: number[], count: number) {
  // Sample in PostgreSQL: only the selected IDs cross the network. Every
  // client uses the same publication/ownership rules and unbiased DB shuffle.
  return prisma.$queryRaw<Array<{ id: string; part: number }>>(Prisma.sql`
    SELECT id, part FROM questions
    WHERE part IN (${Prisma.join(parts)})
      AND (("ownerId" IS NULL AND "publicationStatus" IN ('LEGACY', 'PUBLISHED'))
        OR ("ownerId" = ${userId} AND "publicationStatus" = 'PRIVATE'))
    ORDER BY random() LIMIT ${count}
  `);
}

export async function learningSummary(userId: string) {
  const [totalTests, rows] = await Promise.all([
    prisma.testAttempt.count({ where: { userId } }),
    prisma.$queryRaw<Array<{ part: number; total: bigint; correct: bigint }>>(Prisma.sql`
      SELECT q.part, count(*) AS total,
        sum(CASE WHEN a."isCorrect" THEN 1 ELSE 0 END) AS correct
      FROM user_answers a
      JOIN test_attempts t ON t.id = a."attemptId"
      JOIN questions q ON q.id = a."questionId"
      WHERE t."userId" = ${userId}
      GROUP BY q.part ORDER BY q.part
    `),
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
