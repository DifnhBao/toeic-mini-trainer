import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { sharedQuestionDataSchema } from "@/app/lib/content-contributions";
import { hasRole } from "@/app/lib/authorization";
import { createSignedReadUrl, ObjectStorageConfigurationError } from "@/app/lib/object-storage";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";
import { ingestionImageIds, MAX_INGESTION_IMAGES } from "@/app/lib/ingestion-images";
import { allowedIngestionAudioIds, ingestionAudioIds, MAX_INGESTION_AUDIO } from "@/app/lib/ingestion-audio";

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
        },
      },
    },
  });
  if (!contribution) return apiError("NOT_FOUND", "Không tìm thấy đóng góp chờ duyệt.", 404);
  const parsed = sharedQuestionDataSchema.safeParse(contribution.data);
  if (!parsed.success) return apiError("INVALID_CONTENT", "Nội dung đóng góp không hợp lệ.", 409);
  const audioIds = ingestionAudioIds(parsed.data);
  const attachedAudio = allowedIngestionAudioIds(contribution.sourceJob.result, contribution.sourceJob.audioAssetId);
  if (audioIds.length > MAX_INGESTION_AUDIO || audioIds.some(id => !attachedAudio.has(id))) {
    return apiError("MEDIA_UNAVAILABLE", "Audio không thuộc tác vụ nhập đề.", 409);
  }
  const audios = audioIds.length ? await prisma.uploadedAsset.findMany({
    where: { id: { in: audioIds }, ownerId: contribution.ownerId, kind: "AUDIO", status: "READY" },
    select: { id: true, objectKey: true, originalName: true },
  }) : [];
  if (audios.length !== audioIds.length) return apiError("MEDIA_UNAVAILABLE", "Audio không còn sẵn sàng.", 409);
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
  try {
    const audioPreviews = await Promise.all(audios.map(async audio => ({
      assetId: audio.id,
      fileName: audio.originalName,
      groupNumbers: parsed.data.data.flatMap((group, index) => group.group?.audioAssetId === audio.id ? [index + 1] : []),
      url: await createSignedReadUrl(audio.objectKey, "AUDIO", 300),
    })));
    return apiJson({
      // Keep the single-audio field for older reviewer clients.
      audioUrl: audioPreviews.length === 1 ? audioPreviews[0].url : null,
      audios: audioPreviews,
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
