import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { hasRole } from "@/app/lib/authorization";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";

export const runtime = "nodejs";
const bodySchema = z.object({ reason: z.string().trim().min(5).max(500) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requestUser(request);
  if (!actor) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(actor, "ADMIN")) return apiError("FORBIDDEN", "Chỉ admin được ẩn câu hỏi chung.", 403);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return apiError("INVALID_QUESTION_ID", "Mã câu hỏi không hợp lệ.", 400);
  const body = await parseBoundedJson(request, bodySchema);
  if (!body.success) return body.response;

  const changed = await prisma.$transaction(async (tx) => {
    const result = await tx.question.updateMany({
      where: { id: id.data, ownerId: null, publicationStatus: "PUBLISHED" },
      data: { publicationStatus: "ARCHIVED" },
    });
    if (result.count === 1) {
      await tx.authorizationAuditEvent.create({
        data: { actorId: actor.id, action: "PUBLIC_QUESTION_ARCHIVED", targetType: "Question", targetId: id.data, reason: body.data.reason },
      });
    }
    return result;
  });
  if (changed.count !== 1) return apiError("QUESTION_NOT_PUBLISHED", "Câu hỏi không tồn tại hoặc đã được ẩn.", 404);
  return apiJson({ archived: true });
}
