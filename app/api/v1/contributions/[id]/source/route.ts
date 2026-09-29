import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { hasRole } from "@/app/lib/authorization";
import { createSignedReadUrl, ObjectStorageConfigurationError } from "@/app/lib/object-storage";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(user, "REVIEWER")) return apiError("FORBIDDEN", "Bạn không có quyền xem tài liệu gửi duyệt.", 403);

  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return apiError("INVALID_CONTRIBUTION_ID", "Mã đóng góp không hợp lệ.", 400);
  const contribution = await prisma.contentContribution.findFirst({
    where: { id: id.data, status: "PENDING" },
    select: { sourceJob: { select: { documentAsset: { select: { kind: true, status: true, objectKey: true } } } } },
  });
  const document = contribution?.sourceJob.documentAsset;
  if (!document || document.kind !== "DOCUMENT" || document.status !== "READY") {
    return apiError("SOURCE_NOT_AVAILABLE", "Không tìm thấy PDF đang chờ duyệt.", 404);
  }

  try {
    const url = await createSignedReadUrl(document.objectKey, "DOCUMENT", 5 * 60);
    await prisma.authorizationAuditEvent.create({
      data: { actorId: user.id, action: "REVIEW_SOURCE_ACCESS_GRANTED", targetType: "ContentContribution", targetId: id.data },
    });
    return apiJson({ url, expiresIn: 5 * 60 });
  } catch (error) {
    if (error instanceof ObjectStorageConfigurationError) {
      return apiError("STORAGE_UNAVAILABLE", "Kho file chưa được cấu hình.", 503);
    }
    return apiError("SOURCE_NOT_AVAILABLE", "Không thể mở PDF.", 503);
  }
}
