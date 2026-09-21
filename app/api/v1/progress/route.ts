import { apiError, apiJson } from "@/app/lib/api-response";
import { mobileUserFromRequest } from "@/app/lib/mobile-auth";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await mobileUserFromRequest(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const attempts = await prisma.testAttempt.findMany({
    where: { userId: user.id },
    select: {
      userAnswers: {
        select: { isCorrect: true, question: { select: { part: true } } },
      },
    },
  });

  let correct = 0;
  let total = 0;
  const byPart = new Map<number, { correct: number; total: number }>();
  for (const attempt of attempts) {
    for (const answer of attempt.userAnswers) {
      total += 1;
      if (answer.isCorrect) correct += 1;
      const current = byPart.get(answer.question.part) ?? { correct: 0, total: 0 };
      current.total += 1;
      if (answer.isCorrect) current.correct += 1;
      byPart.set(answer.question.part, current);
    }
  }

  return apiJson({
    totalTests: attempts.length,
    overallAccuracy: total ? Math.round((correct / total) * 100) : 0,
    totalAnswered: total,
    partStats: [...byPart.entries()]
      .map(([part, value]) => ({
        part,
        total: value.total,
        accuracy: Math.round((value.correct / value.total) * 100),
      }))
      .sort((a, b) => a.part - b.part),
  });
}
