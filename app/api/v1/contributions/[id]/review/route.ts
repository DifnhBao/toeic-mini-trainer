import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { reviewContributionSchema, sharedQuestionDataSchema } from "@/app/lib/content-contributions";
import { hasRole } from "@/app/lib/authorization";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { deleteStoredObject, promoteStoredObject, verifyStoredObject } from "@/app/lib/object-storage";
import { prisma } from "@/app/lib/prisma";
import { importExtractedQuestions } from "@/app/lib/question-import";
import { requestUser } from "@/app/lib/request-user";
import { takeRateLimit } from "@/app/lib/rate-limit";

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
          audioAssetId: true,
          audioAsset: { select: {
            ownerId: true, kind: true, status: true, objectKey: true, etag: true,
            originalName: true, contentType: true, sizeBytes: true,
          } },
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

  const submittedAudioIds = new Set(parsed.data.data.flatMap((item) => item.group?.audioAssetId ? [item.group.audioAssetId] : []));
  const sourceAudio = contribution.sourceJob.audioAsset;
  if (submittedAudioIds.size > 1 || (submittedAudioIds.size === 1 &&
    (submittedAudioIds.has(contribution.sourceJob.audioAssetId || "") === false ||
      !sourceAudio || sourceAudio.ownerId !== contribution.ownerId ||
      sourceAudio.kind !== "AUDIO" || sourceAudio.status !== "READY" || !sourceAudio.etag))) {
    return apiError("MEDIA_UNAVAILABLE", "Audio đóng góp không còn sẵn sàng.", 409);
  }

  let sharedObjectKey: string | null = null;
  let committed = false;
  try {
    let sharedAsset: Parameters<typeof importExtractedQuestions>[4];
    let approvedData = parsed.data;
    if (submittedAudioIds.size === 1 && sourceAudio?.etag) {
      const assetId = randomUUID();
      const extension = sourceAudio.objectKey.match(/\.[a-z0-9]{1,8}$/i)?.[0] || "";
      sharedObjectKey = `shared/audio/${contribution.id}/${assetId}${extension}`;
      await promoteStoredObject(sourceAudio.objectKey, sharedObjectKey, `"${sourceAudio.etag}"`);
      const verified = await verifyStoredObject({
        objectKey: sharedObjectKey,
        contentType: sourceAudio.contentType,
        sizeBytes: sourceAudio.sizeBytes,
      });
      if (!verified.valid) throw new Error("SHARED_MEDIA_COPY_INVALID");
      sharedAsset = {
        id: assetId, ownerId: null, kind: "AUDIO", status: "READY",
        objectKey: sharedObjectKey, originalName: sourceAudio.originalName,
        contentType: sourceAudio.contentType, sizeBytes: sourceAudio.sizeBytes,
        etag: verified.etag, verifiedAt: new Date(),
      };
      approvedData = {
        data: parsed.data.data.map((item) => ({
          ...item,
          group: item.group?.audioAssetId ? { ...item.group, audioAssetId: assetId } : item.group,
        })),
      };
    }
    const questionsAdded = await importExtractedQuestions(
      contribution.ownerId,
      approvedData,
      async (tx) => {
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
      sharedAsset,
    );
    committed = true;
    return apiJson({ status: "APPROVED", questionsAdded });
  } catch (error) {
    if (sharedObjectKey && !committed) {
      try { await deleteStoredObject(sharedObjectKey); } catch {
        console.error("shared media cleanup failed", { contributionId: id.data });
      }
    }
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
