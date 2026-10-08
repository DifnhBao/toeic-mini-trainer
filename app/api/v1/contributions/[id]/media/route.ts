import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { sharedQuestionDataSchema } from "@/app/lib/content-contributions";
import { hasRole } from "@/app/lib/authorization";
import { createSignedReadUrl, ObjectStorageConfigurationError } from "@/app/lib/object-storage";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";
import { ingestionImageIds, MAX_INGESTION_IMAGES } from "@/app/lib/ingestion-images";

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
      ownerId: true,
      data: true,
      sourceJob: {
        select: {
          result: true,
          audioAssetId: true,
          audioAsset: { select: { ownerId: true, kind: true, status: true, objectKey: true } },
        },
      },
    },
  });
  if (!contribution) return apiError("NOT_FOUND", "Không tìm thấy đóng góp chờ duyệt.", 404);
  const parsed = sharedQuestionDataSchema.safeParse(contribution.data);
  const audioWasSubmitted = parsed.success && parsed.data.data.some(
    ({ group }) => group?.audioAssetId === contribution.sourceJob.audioAssetId,
  );
  if (!parsed.success) return apiError("INVALID_CONTENT", "Nội dung đóng góp không hợp lệ.", 409);
  const imageIds = ingestionImageIds(parsed.data);
  const attached = new Set(ingestionImageIds(contribution.sourceJob.result));
  if (imageIds.length > MAX_INGESTION_IMAGES || imageIds.some(id => !attached.has(id))) {
    return apiError("MEDIA_UNAVAILABLE", "Ảnh không thuộc tác vụ nhập đề.", 409);
  }
  const images = imageIds.length ? await prisma.uploadedAsset.findMany({
    where: { id: { in: imageIds }, ownerId: contribution.ownerId, kind: "IMAGE", status: "READY" },
    select: { id: true, objectKey: true },
  }) : [];
  if (images.length !== imageIds.length) return apiError("MEDIA_UNAVAILABLE", "Ảnh không còn sẵn sàng.", 409);
  const audio = contribution.sourceJob.audioAsset;
  try {
    return apiJson({
      audioUrl: audioWasSubmitted && audio?.kind === "AUDIO" && audio.status === "READY" && audio.ownerId === contribution.ownerId
        ? await createSignedReadUrl(audio.objectKey, "AUDIO", 300) : null,
      images: await Promise.all(images.map(async image => ({
        assetId: image.id,
        groupNumbers: parsed.data.data.flatMap((group, index) => group.group?.imageAssetId === image.id ? [index + 1] : []),
        url: await createSignedReadUrl(image.objectKey, "IMAGE", 300),
      }))),
    });
  } catch (error) {
    if (error instanceof ObjectStorageConfigurationError) {
      return apiError("STORAGE_UNAVAILABLE", "Kho file chưa được cấu hình.", 503);
    }
    return apiError("MEDIA_UNAVAILABLE", "Không thể mở audio.", 503);
  }
}
