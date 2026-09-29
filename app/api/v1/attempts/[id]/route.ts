import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { mobileUserFromRequest } from "@/app/lib/mobile-auth";
import { prisma } from "@/app/lib/prisma";
import { resolveQuestionGroupMedia } from "@/app/lib/object-storage";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await mobileUserFromRequest(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const attemptId = z.string().uuid().safeParse((await params).id);
  if (!attemptId.success) return apiError("INVALID_ATTEMPT_ID", "Mã kết quả không hợp lệ.", 400);

  const attempt = await prisma.testAttempt.findFirst({
    where: { id: attemptId.data, userId: user.id },
    select: {
      id: true,
      score: true,
      durationSeconds: true,
      completedAt: true,
      test: { select: { id: true, title: true } },
      userAnswers: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          selectedOption: true,
          isCorrect: true,
          aiExplanation: { select: { explanationText: true, suggestedSkills: true } },
          question: {
            select: {
              id: true,
              part: true,
              content: true,
              options: true,
              correctAnswer: true,
              group: {
                select: {
                  passageText: true,
                  audioUrl: true,
                  imageUrl: true,
                  contribution: { select: { status: true } },
                  audioAsset: { select: { objectKey: true, kind: true, status: true, ownerId: true } },
                  imageAsset: { select: { objectKey: true, kind: true, status: true, ownerId: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!attempt) return apiError("ATTEMPT_NOT_FOUND", "Không tìm thấy kết quả.", 404);

  const userAnswers = await Promise.all(
    attempt.userAnswers.map(async (answer) => ({
      ...answer,
      question: {
        ...answer.question,
        group: await resolveQuestionGroupMedia(answer.question.group, user.id),
      },
    })),
  );

  return apiJson({
    attempt: {
      ...attempt,
      completedAt: attempt.completedAt.toISOString(),
      userAnswers,
      total: userAnswers.length,
    },
  });
}
