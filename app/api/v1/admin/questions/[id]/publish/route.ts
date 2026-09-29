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
  if (!hasRole(actor, "ADMIN")) return apiError("FORBIDDEN", "Chỉ admin được xuất bản câu hỏi.", 403);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return apiError("INVALID_QUESTION_ID", "Mã câu hỏi không hợp lệ.", 400);
  const body = await parseBoundedJson(request, bodySchema);
  if (!body.success) return body.response;

  const changed = await prisma.$transaction(async (tx) => {
    const candidate = await tx.question.findFirst({
      where: { id: id.data, ownerId: null, publicationStatus: { in: ["LEGACY", "ARCHIVED"] } },
      select: { group: { select: {
        audioAssetId: true, imageAssetId: true, audioUrl: true, imageUrl: true,
        contribution: { select: { status: true } },
      } } },
    });
    if (!candidate) return { count: 0 };
    const group = candidate.group;
    if (group && (group.audioAssetId || group.imageAssetId || group.audioUrl || group.imageUrl) &&
      group.contribution?.status !== "APPROVED") {
      return { count: -1 };
    }
    const result = await tx.question.updateMany({
      where: { id: id.data, ownerId: null, publicationStatus: { in: ["LEGACY", "ARCHIVED"] } },
      data: { publicationStatus: "PUBLISHED" },
    });
    if (result.count === 1) {
      await tx.authorizationAuditEvent.create({
        data: { actorId: actor.id, action: "PUBLIC_QUESTION_PUBLISHED", targetType: "Question", targetId: id.data, reason: body.data.reason },
      });
    }
    return result;
  });
  if (changed.count === -1) return apiError("MEDIA_REVIEW_REQUIRED", "Câu hỏi có media cũ cần kiểm tra và chuyển sang kho chia sẻ trước.", 409);
  if (changed.count !== 1) return apiError("QUESTION_NOT_ELIGIBLE", "Câu hỏi không thể xuất bản.", 404);
  return apiJson({ published: true });
}
