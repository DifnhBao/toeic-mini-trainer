import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { hasRole } from "@/app/lib/authorization";
import { EXPLANATION_LOCALE, EXPLANATION_PROMPT_VERSION } from "@/app/lib/explanation-cache";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";

export const runtime = "nodejs";
const bodySchema = z.object({ reason: z.string().trim().min(5).max(500) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requestUser(request);
  if (!actor) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(actor, "ADMIN")) return apiError("FORBIDDEN", "Chỉ admin được ẩn lời giải chung.", 403);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return apiError("INVALID_QUESTION_ID", "Mã câu hỏi không hợp lệ.", 400);
  const body = await parseBoundedJson(request, bodySchema);
  if (!body.success) return body.response;

  const hidden = await prisma.$transaction(async (tx) => {
    const question = await tx.question.findFirst({
      where: { id: id.data, ownerId: null, publicationStatus: "PUBLISHED" },
      select: { id: true, contentRevision: true },
    });
    if (!question) return false;
    await tx.questionExplanationCache.upsert({
      where: { questionId_contentRevision_locale_promptVersion: {
        questionId: question.id,
        contentRevision: question.contentRevision,
        locale: EXPLANATION_LOCALE,
        promptVersion: EXPLANATION_PROMPT_VERSION,
      } },
      create: {
        questionId: question.id,
        contentRevision: question.contentRevision,
        locale: EXPLANATION_LOCALE,
        promptVersion: EXPLANATION_PROMPT_VERSION,
        status: "HIDDEN",
      },
      update: { status: "HIDDEN" },
    });
    await tx.authorizationAuditEvent.create({
      data: {
        actorId: actor.id,
        action: "PUBLIC_EXPLANATION_HIDDEN",
        targetType: "Question",
        targetId: question.id,
        reason: body.data.reason,
      },
    });
    return true;
  });
  if (!hidden) return apiError("QUESTION_NOT_PUBLISHED", "Câu hỏi không tồn tại hoặc chưa công khai.", 404);
  return apiJson({ hidden: true });
}
