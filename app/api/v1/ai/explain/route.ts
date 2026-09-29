import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { consumeDailyAiCall } from "@/app/lib/ai-usage";
import {
  canonicalExplanationSchema,
  EXPLANATION_LOCALE,
  EXPLANATION_PROMPT_VERSION,
  formatCanonicalExplanation,
  generateCanonicalExplanation,
} from "@/app/lib/explanation-cache";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { requestUser } from "@/app/lib/request-user";
import { prisma } from "@/app/lib/prisma";
import { takeRateLimit } from "@/app/lib/rate-limit";

export const runtime = "nodejs";
const explainSchema = z.object({ userAnswerId: z.string().uuid() }).strict();
const GENERATING_STALE_MS = 2 * 60_000;
const FAILED_RETRY_MS = 60_000;

export async function POST(request: Request) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  const limit = takeRateLimit(request, `mobile-ai-explain:${user.id}`, 30, 60_000);
  if (!limit.allowed) return apiError("RATE_LIMITED", "Bạn đang yêu cầu quá nhanh.", 429);
  const body = await parseBoundedJson(request, explainSchema);
  if (!body.success) return body.response;

  const answer = await prisma.userAnswer.findFirst({
    where: { id: body.data.userAnswerId, attempt: { userId: user.id } },
    include: { question: { include: { group: true } }, aiExplanation: true },
  });
  if (!answer) return apiError("ANSWER_NOT_FOUND", "Không tìm thấy câu trả lời của bạn.", 404);
  if (answer.isCorrect) return apiError("ALREADY_CORRECT", "Câu này đã đúng.", 422);

  const question = answer.question;
  const key = {
    questionId: question.id,
    contentRevision: question.contentRevision,
    locale: EXPLANATION_LOCALE,
    promptVersion: EXPLANATION_PROMPT_VERSION,
  };
  let cache = await prisma.questionExplanationCache.findUnique({
    where: { questionId_contentRevision_locale_promptVersion: key },
  });
  if (cache?.status === "READY") {
    const parsed = canonicalExplanationSchema.safeParse(cache.explanation);
    if (parsed.success) {
      const explanationText = formatCanonicalExplanation(parsed.data, question.correctAnswer, answer.selectedOption);
      await prisma.aiExplanation.upsert({
        where: { userAnswerId: answer.id },
        create: { userAnswerId: answer.id, explanationText },
        update: { explanationText },
      });
      return apiJson({ explanation: { explanationText, suggestedSkills: null, cached: true } });
    }
  }
  if (cache?.status === "HIDDEN") return apiError("EXPLANATION_HIDDEN", "Lời giải đang được kiểm tra lại.", 422);
  if (answer.aiExplanation) {
    return apiJson({ explanation: {
      explanationText: answer.aiExplanation.explanationText,
      suggestedSkills: answer.aiExplanation.suggestedSkills,
      cached: true,
    } });
  }

  const now = new Date();
  if (!cache) {
    try {
      cache = await prisma.questionExplanationCache.create({
        data: { ...key, status: "GENERATING", startedAt: now },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return apiError("EXPLANATION_PENDING", "Lời giải đang được tạo, hãy thử lại sau.", 409);
      }
      throw error;
    }
  } else {
    const staleBefore = new Date(now.getTime() - GENERATING_STALE_MS);
    const retryBefore = new Date(now.getTime() - FAILED_RETRY_MS);
    const canRetry = (cache.status === "GENERATING" && cache.startedAt < staleBefore)
      || (cache.status === "FAILED" && cache.updatedAt < retryBefore)
      || (cache.status === "READY" && !canonicalExplanationSchema.safeParse(cache.explanation).success);
    if (!canRetry) return apiError("EXPLANATION_PENDING", "Lời giải đang được tạo, hãy thử lại sau.", 409);
    const claimed = await prisma.questionExplanationCache.updateMany({
      where: { id: cache.id, status: cache.status, updatedAt: cache.updatedAt },
      data: { status: "GENERATING", startedAt: now, explanation: Prisma.JsonNull },
    });
    if (claimed.count !== 1) return apiError("EXPLANATION_PENDING", "Lời giải đang được tạo, hãy thử lại sau.", 409);
  }

  let quotaAllowed = false;
  try {
    quotaAllowed = await consumeDailyAiCall(user.id, "explain", 20);
  } catch {
    await prisma.questionExplanationCache.updateMany({ where: { id: cache.id, status: "GENERATING" }, data: { status: "FAILED" } });
    return apiError("AI_UNAVAILABLE", "Chưa thể kiểm tra hạn mức AI.", 503);
  }
  if (!quotaAllowed) {
    await prisma.questionExplanationCache.updateMany({ where: { id: cache.id, status: "GENERATING" }, data: { status: "FAILED" } });
    return apiError("AI_DAILY_LIMIT", "Bạn đã dùng hết lượt tạo lời giải hôm nay.", 429);
  }

  try {
    const generated = await generateCanonicalExplanation(question);
    const saved = await prisma.questionExplanationCache.updateMany({
      where: { id: cache.id, status: "GENERATING" },
      data: { status: "READY", explanation: generated, generatedAt: new Date() },
    });
    if (saved.count !== 1) return apiError("EXPLANATION_CHANGED", "Lời giải đã được thay đổi trong lúc tạo.", 409);
    const explanationText = formatCanonicalExplanation(generated, question.correctAnswer, answer.selectedOption);
    await prisma.aiExplanation.upsert({
      where: { userAnswerId: answer.id },
      create: { userAnswerId: answer.id, explanationText },
      update: { explanationText },
    });
    return apiJson({ explanation: { explanationText, suggestedSkills: null, cached: false } });
  } catch (error) {
    await prisma.questionExplanationCache.updateMany({ where: { id: cache.id, status: "GENERATING" }, data: { status: "FAILED" } });
    console.error("canonical explanation failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return apiError("AI_UNAVAILABLE", "Chưa tạo được lời giải. Vui lòng thử lại sau.", 503);
  }
}
