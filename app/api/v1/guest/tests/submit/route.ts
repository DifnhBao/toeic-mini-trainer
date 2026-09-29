import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { canonicalExplanationSchema, EXPLANATION_LOCALE, EXPLANATION_PROMPT_VERSION, formatCanonicalExplanation } from "@/app/lib/explanation-cache";
import { verifyGuestChallenge } from "@/app/lib/guest-tests";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { resolveQuestionGroupMedia } from "@/app/lib/object-storage";
import { prisma } from "@/app/lib/prisma";
import { takeRateLimit } from "@/app/lib/rate-limit";

export const runtime = "nodejs";

const submitSchema = z.object({
  challengeToken: z.string().min(100).max(8_000),
  answers: z.record(z.string().uuid(), z.enum(["A", "B", "C", "D"])),
}).strict();

export async function POST(request: Request) {
  if (request.headers.has("authorization")) return apiError("INVALID_GUEST_REQUEST", "Hãy đăng xuất hoặc đăng nhập lại.", 401);
  const limit = takeRateLimit(request, "guest-test-submit", 20, 60_000);
  if (!limit.allowed) return apiError("RATE_LIMITED", "Bạn thao tác quá nhanh.", 429);
  const body = await parseBoundedJson(request, submitSchema);
  if (!body.success) return body.response;

  let ids: string[];
  try {
    ids = await verifyGuestChallenge(body.data.challengeToken);
  } catch {
    return apiError("INVALID_CHALLENGE", "Bài học thử đã hết hạn. Hãy tạo bài mới.", 401);
  }
  if (Object.keys(body.data.answers).some((id) => !ids.includes(id))) {
    return apiError("INVALID_ANSWERS", "Đáp án không thuộc bài học thử.", 400);
  }

  const questions = await prisma.question.findMany({
    where: { id: { in: ids }, ownerId: null, publicationStatus: "PUBLISHED" },
    select: {
      id: true, part: true, content: true, options: true, correctAnswer: true, contentRevision: true,
      explanationCaches: {
        where: { status: "READY", locale: EXPLANATION_LOCALE, promptVersion: EXPLANATION_PROMPT_VERSION },
        orderBy: { contentRevision: "desc" }, take: 1,
        select: { contentRevision: true, explanation: true },
      },
      group: { select: {
        id: true, groupType: true, passageText: true, audioUrl: true, imageUrl: true,
        contribution: { select: { status: true } },
        audioAsset: { select: { objectKey: true, kind: true, status: true, ownerId: true } },
        imageAsset: { select: { objectKey: true, kind: true, status: true, ownerId: true } },
      } },
    },
  });
  if (questions.length !== ids.length) return apiError("TEST_CHANGED", "Nội dung bài đã thay đổi. Hãy tạo bài mới.", 409);
  const byId = new Map(questions.map((question) => [question.id, question]));
  const results = await Promise.all(ids.map(async (id) => {
    const question = byId.get(id)!;
    const selectedOption = body.data.answers[id] || null;
    const cached = question.explanationCaches[0];
    const parsed = cached?.contentRevision === question.contentRevision
      ? canonicalExplanationSchema.safeParse(cached.explanation)
      : null;
    return {
      selectedOption,
      isCorrect: selectedOption === question.correctAnswer,
      explanationText: selectedOption !== question.correctAnswer && parsed?.success
        ? formatCanonicalExplanation(parsed.data, question.correctAnswer, selectedOption)
        : null,
      question: {
        id: question.id,
        part: question.part,
        content: question.content,
        options: question.options,
        correctAnswer: question.correctAnswer,
        group: await resolveQuestionGroupMedia(question.group, ""),
      },
    };
  }));
  return apiJson({ score: results.filter((result) => result.isCorrect).length, total: results.length, results });
}
