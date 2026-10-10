import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { hasRole } from "@/app/lib/authorization";
import { ingestionAudioIds, MAX_INGESTION_AUDIO } from "@/app/lib/ingestion-audio";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { extractionDraftSchema } from "@/app/lib/question-import";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";
import { takeRateLimit } from "@/app/lib/rate-limit";

export const runtime = "nodejs";

const audioSchema = z.object({
  groupIndex: z.number().int().min(0).max(249),
  // null restores the job's original audio, rather than deleting its source.
  audioAssetId: z.string().uuid().nullable(),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(user, "ADMIN")) return apiError("ADMIN_CONTENT_ONLY", "Chỉ quản trị viên được gắn audio vào đề.", 403);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return apiError("INVALID_JOB_ID", "Mã tác vụ không hợp lệ.", 400);
  const body = await parseBoundedJson(request, audioSchema);
  if (!body.success) return body.response;
  const limit = await takeRateLimit(request, `ingestion-audio:${user.id}`, 30, 60_000);
  if (limit.unavailable) return apiError("RATE_LIMIT_UNAVAILABLE", "Dịch vụ tạm thời không sẵn sàng.", 503);
  if (!limit.allowed) return apiError("RATE_LIMITED", "Bạn thao tác quá nhanh.", 429, { "Retry-After": String(limit.retryAfterSeconds) });
  const job = await prisma.ingestionJob.findFirst({
    where: { id: id.data, ownerId: user.id, status: { in: ["COMPLETED", "IMPORTED"] }, contribution: { is: null } },
    select: { result: true, updatedAt: true, audioAssetId: true },
  });
  const parsed = extractionDraftSchema.safeParse(job?.result);
  if (!job || !parsed.success) return apiError("JOB_NOT_EDITABLE", "Tác vụ chưa sẵn sàng hoặc đã gửi duyệt. Hãy tải lại tài liệu.", 409);
  const selected = parsed.data.data[body.data.groupIndex];
  if (!selected) return apiError("INVALID_GROUP", "Không tìm thấy nhóm câu hỏi.", 400);
  const audioAssetId = body.data.audioAssetId ?? job.audioAssetId;
  if (audioAssetId) {
    const asset = await prisma.uploadedAsset.findFirst({
      where: { id: audioAssetId, ownerId: user.id, kind: "AUDIO", status: "READY" }, select: { id: true },
    });
    if (!asset) return apiError("AUDIO_UNAVAILABLE", "Audio chưa sẵn sàng hoặc không thuộc tài khoản này.", 409);
  }
  selected.group = {
    ...(selected.group || { groupType: "AUDIO" }),
    audioAssetId, audioUrl: null,
  };
  if (ingestionAudioIds(parsed.data).length > MAX_INGESTION_AUDIO) {
    return apiError("TOO_MANY_AUDIO", `Mỗi tác vụ tối đa ${MAX_INGESTION_AUDIO} audio. Hãy chia nhóm trang.`, 400);
  }
  const changed = await prisma.ingestionJob.updateMany({
    where: { id: id.data, ownerId: user.id, status: { in: ["COMPLETED", "IMPORTED"] }, updatedAt: job.updatedAt, contribution: { is: null } },
    data: { result: parsed.data, updatedAt: new Date(Math.max(Date.now(), job.updatedAt.getTime() + 1)) },
  });
  if (changed.count !== 1) return apiError("JOB_CHANGED", "Tài liệu vừa thay đổi. Hãy mở lại trước khi gắn audio.", 409);
  return apiJson({ group: selected.group, usesSourceAudio: !body.data.audioAssetId });
}
