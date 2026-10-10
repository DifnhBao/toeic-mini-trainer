import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { requestUser } from "@/app/lib/request-user";
import { prisma } from "@/app/lib/prisma";
import { takeRateLimit } from "@/app/lib/rate-limit";

export const runtime = "nodejs";

const submitSchema = z.object({
  clientSubmissionId: z.string().uuid(),
  durationSeconds: z.number().int().min(0).max(24 * 60 * 60),
  answers: z.record(z.string().uuid(), z.enum(["A", "B", "C", "D"])).refine(
    (answers) => Object.keys(answers).length <= 50,
    "Too many answers",
  ),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const testId = z.string().uuid().safeParse((await params).id);
  if (!testId.success) return apiError("INVALID_TEST_ID", "Mã bài luyện không hợp lệ.", 400);

  const limit = await takeRateLimit(request, `mobile-test-submit:${user.id}`, 30, 60_000);
  if (limit.unavailable) return apiError("RATE_LIMIT_UNAVAILABLE", "Dịch vụ tạm thời không sẵn sàng. Hãy thử lại sau.", 503, { "Retry-After": String(limit.retryAfterSeconds) });
  if (!limit.allowed) {
    return apiError("RATE_LIMITED", "Bạn nộp bài quá nhanh. Vui lòng thử lại sau.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const body = await parseBoundedJson(request, submitSchema);
  if (!body.success) return body.response;

  const existing = await prisma.testAttempt.findUnique({
    where: { clientSubmissionId: body.data.clientSubmissionId },
    select: { id: true, userId: true, testId: true, score: true, _count: { select: { userAnswers: true } } },
  });
  if (existing) {
    if (existing.userId !== user.id || existing.testId !== testId.data) {
      return apiError("SUBMISSION_CONFLICT", "Mã lần nộp đã được sử dụng.", 409);
    }
    return apiJson({
      attemptId: existing.id,
      score: existing.score ?? 0,
      total: existing._count.userAnswers,
      duplicate: true,
    });
  }

  const test = await prisma.miniTest.findFirst({
    where: { id: testId.data, createdById: user.id },
    select: {
      id: true,
      questions: {
        select: {
          question: { select: { id: true, correctAnswer: true, options: true } },
        },
      },
    },
  });
  if (!test) return apiError("TEST_NOT_FOUND", "Không tìm thấy bài luyện.", 404);

  const questionIds = new Set(test.questions.map((item) => item.question.id));
  if (Object.keys(body.data.answers).some((id) => !questionIds.has(id))) {
    return apiError("INVALID_ANSWERS", "Đáp án chứa câu hỏi không thuộc bài luyện.", 400);
  }

  if (test.questions.some(({ question }) => {
    const selected = body.data.answers[question.id];
    return selected && !Object.hasOwn(question.options as Record<string, unknown>, selected);
  })) {
    return apiError("INVALID_ANSWERS", "Lựa chọn không tồn tại trong câu hỏi.", 400);
  }

  const answerRows = test.questions.map(({ question }) => {
    const selectedOption = body.data.answers[question.id] ?? null;
    return {
      questionId: question.id,
      selectedOption,
      isCorrect: selectedOption === question.correctAnswer,
    };
  });
  const score = answerRows.filter((answer) => answer.isCorrect).length;

  try {
    const attempt = await prisma.testAttempt.create({
      data: {
        userId: user.id,
        testId: test.id,
        clientSubmissionId: body.data.clientSubmissionId,
        durationSeconds: body.data.durationSeconds,
        score,
        userAnswers: { create: answerRows },
      },
      select: { id: true },
    });
    return apiJson({ attemptId: attempt.id, score, total: answerRows.length });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.testAttempt.findUnique({
        where: { clientSubmissionId: body.data.clientSubmissionId },
        select: { id: true, userId: true, testId: true, score: true, _count: { select: { userAnswers: true } } },
      });
      if (raced?.userId === user.id && raced.testId === test.id) {
        return apiJson({
          attemptId: raced.id,
          score: raced.score ?? 0,
          total: raced._count.userAnswers,
          duplicate: true,
        });
      }
      if (raced) return apiError("SUBMISSION_CONFLICT", "Mã lần nộp đã được sử dụng.", 409);
    }
    throw error;
  }
}
