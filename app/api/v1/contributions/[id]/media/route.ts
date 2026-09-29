import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { sharedQuestionDataSchema } from "@/app/lib/content-contributions";
import { hasRole } from "@/app/lib/authorization";
import { createSignedReadUrl, ObjectStorageConfigurationError } from "@/app/lib/object-storage";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(user, "REVIEWER")) return apiError("FORBIDDEN", "Bạn không có quyền xem media đang chờ duyệt.", 403);

  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return apiError("INVALID_CONTRIBUTION_ID", "Mã đóng góp không hợp lệ.", 400);
  const contribution = await prisma.contentContribution.findFirst({
    where: { id: id.data, status: "PENDING" },
    select: {
      data: true,
      sourceJob: {
        select: {
          audioAssetId: true,
          audioAsset: { select: { kind: true, status: true, objectKey: true } },
        },
      },
    },
  });
  if (!contribution) return apiError("NOT_FOUND", "Không tìm thấy đóng góp chờ duyệt.", 404);
  const parsed = sharedQuestionDataSchema.safeParse(contribution.data);
  const audioWasSubmitted = parsed.success && parsed.data.data.some(
    ({ group }) => group?.audioAssetId === contribution.sourceJob.audioAssetId,
  );
  if (!audioWasSubmitted) return apiJson({ audioUrl: null });
  const audio = contribution.sourceJob.audioAsset;
  if (!audio || audio.kind !== "AUDIO" || audio.status !== "READY") return apiJson({ audioUrl: null });
  try {
    return apiJson({ audioUrl: await createSignedReadUrl(audio.objectKey, "AUDIO") });
  } catch (error) {
    if (error instanceof ObjectStorageConfigurationError) {
      return apiError("STORAGE_UNAVAILABLE", "Kho file chưa được cấu hình.", 503);
    }
    return apiError("MEDIA_UNAVAILABLE", "Không thể mở audio.", 503);
  }
}
