import { safeErrorType } from "@/app/lib/server-error-log";
import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { createGuestChallenge, guestDailyLimit, guestQuotaKey, shuffleGuestQuestions } from "@/app/lib/guest-tests";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { resolveQuestionGroupMedia } from "@/app/lib/object-storage";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

const createSchema = z.object({
  count: z.number().int().min(5).max(20),
  parts: z.array(z.number().int().min(1).max(7)).min(1).max(7),
}).strict();

export async function POST(request: Request) {
  // An invalid user token must never silently downgrade to guest access.
  if (request.headers.has("authorization")) return apiError("INVALID_GUEST_REQUEST", "Hãy đăng xuất hoặc đăng nhập lại.", 401);
  const body = await parseBoundedJson(request, createSchema);
  if (!body.success) return body.response;

  try {
    const candidates = await prisma.question.findMany({
      where: { publicationStatus: "PUBLISHED", ownerId: null, part: { in: body.data.parts } },
      select: {
        id: true, part: true, content: true, options: true,
        group: { select: {
          id: true, groupType: true, passageText: true, audioUrl: true, imageUrl: true,
          contribution: { select: { status: true } },
          audioAsset: { select: { objectKey: true, kind: true, status: true, ownerId: true } },
          imageAsset: { select: { objectKey: true, kind: true, status: true, ownerId: true } },
        } },
      },
    });
    if (!candidates.length) return apiError("NO_QUESTIONS", "Kho chung chưa có câu hỏi phù hợp.", 422);

    const selected = shuffleGuestQuestions(candidates).slice(0, body.data.count);
    const quotaKey = guestQuotaKey(request);
    const quota = await prisma.guestUsage.upsert({
      where: { key: quotaKey },
      create: { key: quotaKey, count: 1, expiresAt: new Date(Date.now() + 48 * 60 * 60_000) },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    if (quota.count > guestDailyLimit()) return apiError("GUEST_LIMIT", "Bạn đã dùng hết lượt học thử hôm nay.", 429);

    const challengeToken = await createGuestChallenge(selected.map((question) => question.id));
    const questions = await Promise.all(selected.map(async (question, index) => ({
      orderIndex: index + 1,
      question: { ...question, group: await resolveQuestionGroupMedia(question.group, "") },
    })));
    return apiJson({
      challengeToken,
      test: { id: "guest", title: "Bài học thử", createdAt: new Date().toISOString(), questions },
      remainingToday: Math.max(0, guestDailyLimit() - quota.count),
    }, { status: 201 });
  } catch (error) {
    console.error("guest test creation failed", { errorType: safeErrorType(error) });
    return apiError("GUEST_TEST_UNAVAILABLE", "Chưa thể tạo bài học thử.", 503);
  }
}
