import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { hasRole } from "@/app/lib/authorization";
import { ingestionImageIds, MAX_INGESTION_IMAGES } from "@/app/lib/ingestion-images";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { extractionDraftSchema } from "@/app/lib/question-import";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";
import { takeRateLimit } from "@/app/lib/rate-limit";

export const runtime = "nodejs";

const imageSchema = z.object({
  groupIndex: z.number().int().min(0).max(249),
  imageAssetId: z.string().uuid().nullable(),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(user, "ADMIN")) return apiError("ADMIN_CONTENT_ONLY", "Chỉ quản trị viên được gắn ảnh vào đề.", 403);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return apiError("INVALID_JOB_ID", "Mã tác vụ không hợp lệ.", 400);
  const body = await parseBoundedJson(request, imageSchema);
  if (!body.success) return body.response;
  const limit = await takeRateLimit(request, `ingestion-image:${user.id}`, 30, 60_000);
  if (limit.unavailable) return apiError("RATE_LIMIT_UNAVAILABLE", "Dịch vụ tạm thời không sẵn sàng.", 503);
  if (!limit.allowed) return apiError("RATE_LIMITED", "Bạn thao tác quá nhanh.", 429, { "Retry-After": String(limit.retryAfterSeconds) });
  const job = await prisma.ingestionJob.findFirst({
    where: { id: id.data, ownerId: user.id, status: { in: ["COMPLETED", "IMPORTED"] }, contribution: { is: null } },
    select: { result: true, updatedAt: true },
  });
  const parsed = extractionDraftSchema.safeParse(job?.result);
  if (!job || !parsed.success) return apiError("JOB_NOT_EDITABLE", "Tác vụ chưa sẵn sàng hoặc đã gửi duyệt. Hãy tải lại tài liệu.", 409);
  const selected = parsed.data.data[body.data.groupIndex];
  if (!selected) return apiError("INVALID_GROUP", "Không tìm thấy nhóm câu hỏi.", 400);
  if (body.data.imageAssetId) {
    const asset = await prisma.uploadedAsset.findFirst({
      where: { id: body.data.imageAssetId, ownerId: user.id, kind: "IMAGE", status: "READY" },
      select: { id: true },
    });
    if (!asset) return apiError("IMAGE_UNAVAILABLE", "Ảnh chưa sẵn sàng hoặc không thuộc tài khoản này.", 409);
  }
  selected.group = {
    ...(selected.group || { groupType: selected.questions.some(question => question.part <= 4) ? "AUDIO" : "TEXT" }),
    imageAssetId: body.data.imageAssetId, imageUrl: null,
  };
  if (ingestionImageIds(parsed.data).length > MAX_INGESTION_IMAGES) {
    return apiError("TOO_MANY_IMAGES", `Mỗi tác vụ tối đa ${MAX_INGESTION_IMAGES} ảnh. Hãy chia nhóm trang.`, 400);
  }
  const changed = await prisma.ingestionJob.updateMany({
    where: { id: id.data, ownerId: user.id, status: { in: ["COMPLETED", "IMPORTED"] }, updatedAt: job.updatedAt, contribution: { is: null } },
    data: { result: parsed.data, updatedAt: new Date(Math.max(Date.now(), job.updatedAt.getTime() + 1)) },
  });
  if (changed.count !== 1) return apiError("JOB_CHANGED", "Tài liệu vừa thay đổi. Hãy mở lại trước khi gắn ảnh.", 409);
  return apiJson({ group: selected.group, attached: Boolean(body.data.imageAssetId) });
}
