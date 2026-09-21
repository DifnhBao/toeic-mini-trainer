import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { mobileUserFromRequest } from "@/app/lib/mobile-auth";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await mobileUserFromRequest(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const url = new URL(request.url);
  const cursorParam = url.searchParams.get("cursor");
  const cursor = cursorParam ? z.string().uuid().safeParse(cursorParam) : null;
  if (cursor && !cursor.success) return apiError("INVALID_CURSOR", "Con trỏ không hợp lệ.", 400);

  const take = 20;
  const attempts = await prisma.testAttempt.findMany({
    where: { userId: user.id },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor?.success ? { cursor: { id: cursor.data }, skip: 1 } : {}),
    select: {
      id: true,
      score: true,
      durationSeconds: true,
      completedAt: true,
      test: { select: { id: true, title: true } },
      _count: { select: { userAnswers: true } },
    },
  });

  const hasMore = attempts.length > take;
  const page = attempts.slice(0, take);
  return apiJson({
    attempts: page.map((attempt) => ({
      id: attempt.id,
      title: attempt.test.title,
      testId: attempt.test.id,
      score: attempt.score ?? 0,
      total: attempt._count.userAnswers,
      accuracy: attempt._count.userAnswers
        ? Math.round(((attempt.score ?? 0) / attempt._count.userAnswers) * 100)
        : 0,
      durationSeconds: attempt.durationSeconds,
      completedAt: attempt.completedAt.toISOString(),
    })),
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  });
}
