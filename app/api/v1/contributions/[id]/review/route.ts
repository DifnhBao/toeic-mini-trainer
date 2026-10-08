import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { reviewContributionSchema, sharedQuestionDataSchema } from "@/app/lib/content-contributions";
import { hasRole } from "@/app/lib/authorization";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { prisma } from "@/app/lib/prisma";
import { importExtractedQuestions } from "@/app/lib/question-import";
import { requestUser } from "@/app/lib/request-user";
import { takeRateLimit } from "@/app/lib/rate-limit";
import { ingestionImageIds, MAX_INGESTION_IMAGES } from "@/app/lib/ingestion-images";
import { allowedIngestionAudioIds, ingestionAudioIds, MAX_INGESTION_AUDIO } from "@/app/lib/ingestion-audio";
import { withContributionMedia, type SourceMediaAsset } from "@/app/lib/shared-media-copy";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(user, "REVIEWER")) return apiError("FORBIDDEN", "Bạn không có quyền duyệt.", 403);

  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return apiError("INVALID_CONTRIBUTION_ID", "Mã đóng góp không hợp lệ.", 400);
  const limit = await takeRateLimit(request, `contribution-review:${user.id}`, 30, 60_000);
  if (limit.unavailable) return apiError("RATE_LIMIT_UNAVAILABLE", "Dịch vụ tạm thời không sẵn sàng. Hãy thử lại sau.", 503, { "Retry-After": String(limit.retryAfterSeconds) });
  if (!limit.allowed) return apiError("RATE_LIMITED", "Bạn thao tác quá nhanh.", 429, { "Retry-After": String(limit.retryAfterSeconds) });
  const body = await parseBoundedJson(request, reviewContributionSchema);
  if (!body.success) return body.response;

  const contribution = await prisma.contentContribution.findUnique({
    where: { id: id.data },
    select: {
      id: true, ownerId: true, status: true, data: true,
      sourceJob: {
        select: {
          result: true,
          audioAssetId: true,
        },
      },
    },
  });
  if (!contribution) return apiError("NOT_FOUND", "Không tìm thấy đóng góp.", 404);
  if (contribution.status !== "PENDING") {
    return apiError("ALREADY_REVIEWED", "Đóng góp đã được xử lý.", 409);
  }
  if (contribution.ownerId === user.id && user.role !== "ADMIN") {
    return apiError("SELF_REVIEW_NOT_ALLOWED", "Người duyệt không thể tự xét đóng góp của mình.", 403);
  }

  const reviewedAt = new Date();
  if (body.data.decision === "REJECT") {
    const changed = await prisma.$transaction(async (tx) => {
      const result = await tx.contentContribution.updateMany({
        where: { id: id.data, status: "PENDING" },
        data: { status: "REJECTED", reviewedById: user.id, reviewedAt, reviewNote: body.data.note },
      });
      if (result.count === 1) {
        await tx.authorizationAuditEvent.create({
          data: { actorId: user.id, action: "CONTRIBUTION_REJECTED", targetType: "ContentContribution", targetId: id.data, reason: body.data.note },
        });
      }
      return result;
    });
    if (changed.count !== 1) return apiError("ALREADY_REVIEWED", "Đóng góp đã được xử lý.", 409);
    return apiJson({ status: "REJECTED" });
  }

  const parsed = sharedQuestionDataSchema.safeParse(contribution.data);
  if (!parsed.success) return apiError("INVALID_CONTENT", "Nội dung đóng góp không còn hợp lệ.", 422);
  if (parsed.data.data.some(item => item.questions.some(question =>
    (question.part <= 4 && !item.group?.audioAssetId) || (question.part === 1 && !item.group?.imageAssetId)))) {
    return apiError("MEDIA_REQUIRED", "Bài nghe cần audio; Part 1 cần thêm ảnh trước khi công khai.", 422);
  }

  const audioIds = ingestionAudioIds(parsed.data);
  const attachedAudio = allowedIngestionAudioIds(contribution.sourceJob.result, contribution.sourceJob.audioAssetId);
  if (audioIds.length > MAX_INGESTION_AUDIO || audioIds.some(id => !attachedAudio.has(id))) {
    return apiError("MEDIA_UNAVAILABLE", "Audio không thuộc tác vụ nhập đề.", 409);
  }
  const audios = audioIds.length ? await prisma.uploadedAsset.findMany({
    where: { id: { in: audioIds }, ownerId: contribution.ownerId, kind: "AUDIO", status: "READY", etag: { not: null } },
    select: { id: true, objectKey: true, etag: true, originalName: true, contentType: true, sizeBytes: true },
  }) : [];
  if (audios.length !== audioIds.length) {
    return apiError("MEDIA_UNAVAILABLE", "Audio đóng góp không còn sẵn sàng.", 409);
  }

  const imageIds = ingestionImageIds(parsed.data);
  const attachedIds = new Set(ingestionImageIds(contribution.sourceJob.result));
  if (imageIds.length > MAX_INGESTION_IMAGES || imageIds.some(id => !attachedIds.has(id))) {
    return apiError("MEDIA_UNAVAILABLE", "Ảnh không thuộc tác vụ nhập đề.", 409);
  }
  const images = imageIds.length ? await prisma.uploadedAsset.findMany({
    where: { id: { in: imageIds }, ownerId: contribution.ownerId, kind: "IMAGE", status: "READY", etag: { not: null } },
    select: { id: true, objectKey: true, etag: true, originalName: true, contentType: true, sizeBytes: true },
  }) : [];
  if (images.length !== imageIds.length) return apiError("MEDIA_UNAVAILABLE", "Ảnh đóng góp không còn sẵn sàng.", 409);
  const mediaSources: SourceMediaAsset[] = images.map(image => ({ ...image, kind: "IMAGE", etag: image.etag! }));
  mediaSources.push(...audios.map(audio => ({ ...audio, kind: "AUDIO" as const, etag: audio.etag! })));
  try {
    const questionsAdded = await withContributionMedia(contribution.id, parsed.data, mediaSources,
      ({ sharedAssets, approvedData }) => importExtractedQuestions(
      contribution.ownerId,
      approvedData,
      async (tx) => {
        if (mediaSources.length) {
          const ready = await tx.uploadedAsset.count({ where: {
            ownerId: contribution.ownerId, status: "READY",
            OR: mediaSources.map(asset => ({ id: asset.id, kind: asset.kind, etag: asset.etag })),
          } });
          if (ready !== mediaSources.length) throw new Error("ASSET_OWNERSHIP_INVALID");
        }
        const changed = await tx.contentContribution.updateMany({
          where: { id: id.data, status: "PENDING" },
          data: { status: "APPROVED", reviewedById: user.id, reviewedAt, reviewNote: body.data.note || null },
        });
        if (changed.count !== 1) throw new Error("ALREADY_REVIEWED");
        await tx.authorizationAuditEvent.create({
          data: { actorId: user.id, action: "CONTRIBUTION_APPROVED", targetType: "ContentContribution", targetId: id.data, reason: body.data.note || null },
        });
      },
      id.data,
      sharedAssets,
      ),
      async keys => (await prisma.uploadedAsset.count({ where: { objectKey: { in: keys }, ownerId: null } })) === 0,
    );
    return apiJson({ status: "APPROVED", questionsAdded });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_REVIEWED") {
      return apiError("ALREADY_REVIEWED", "Đóng góp đã được xử lý.", 409);
    }
    if (error instanceof Error && error.message === "ASSET_OWNERSHIP_INVALID") {
      return apiError("MEDIA_UNAVAILABLE", "Media không còn sẵn sàng.", 409);
    }
    console.error("contribution approval failed", { contributionId: id.data, errorType: error instanceof Error ? error.name : "unknown" });
    return apiError("APPROVAL_FAILED", "Không thể duyệt đóng góp lúc này.", 500);
  }
}
