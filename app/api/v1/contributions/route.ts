import { apiError, apiJson } from "@/app/lib/api-response";
import {
  contributionQuestionCount,
  submitContributionSchema,
  sharedQuestionDataSchema,
} from "@/app/lib/content-contributions";
import { buildReviewedImport, InvalidIngestionReviewError } from "@/app/lib/ingestion-review";
import { hasRole } from "@/app/lib/authorization";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { requestUser } from "@/app/lib/request-user";
import { prisma } from "@/app/lib/prisma";
import { takeRateLimit } from "@/app/lib/rate-limit";
import { ingestionImageIds, MAX_INGESTION_IMAGES } from "@/app/lib/ingestion-images";
import { allowedIngestionAudioIds, ingestionAudioIds, MAX_INGESTION_AUDIO } from "@/app/lib/ingestion-audio";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const mine = await prisma.contentContribution.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, sourceJobId: true, status: true, reviewNote: true, createdAt: true, reviewedAt: true },
  });

  const isReviewer = hasRole(user, "REVIEWER");
  const pending = isReviewer
    ? await prisma.contentContribution.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: {
          id: true, createdAt: true, data: true,
          owner: { select: { name: true, email: true } },
        },
      })
    : [];

  return apiJson({ mine, isReviewer, pending });
}

export async function POST(request: Request) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(user, "ADMIN")) return apiError("ADMIN_CONTENT_ONLY", "Chỉ quản trị viên được chuẩn bị nội dung mới cho kho chung.", 403);

  const limit = await takeRateLimit(request, `contribution-submit:${user.id}`, 5, 60_000);
  if (limit.unavailable) return apiError("RATE_LIMIT_UNAVAILABLE", "Dịch vụ tạm thời không sẵn sàng. Hãy thử lại sau.", 503, { "Retry-After": String(limit.retryAfterSeconds) });
  if (!limit.allowed) return apiError("RATE_LIMITED", "Bạn gửi quá nhanh.", 429, { "Retry-After": String(limit.retryAfterSeconds) });

  const body = await parseBoundedJson(request, submitContributionSchema, 512 * 1024);
  if (!body.success) return body.response;

  const job = await prisma.ingestionJob.findFirst({
    where: { id: body.data.jobId, ownerId: user.id, status: { in: ["COMPLETED", "IMPORTED"] } },
    select: { id: true, audioAssetId: true, result: true, updatedAt: true },
  });
  if (!job?.result) return apiError("JOB_NOT_READY", "Bộ đề chưa sẵn sàng để gửi.", 409);

  let reviewedData;
  try {
    const candidate = "reviews" in body.data
      ? buildReviewedImport(job.result, { reviews: body.data.reviews })
      : body.data.data;
    // The shared copy must not retain legacy paths to private source material.
    reviewedData = sharedQuestionDataSchema.parse({ data: candidate.data.map(({ group, questions }) => ({
      group: group ? { ...group, audioUrl: null, imageUrl: null } : group, questions,
    })) });
  } catch (error) {
    if (error instanceof InvalidIngestionReviewError) return apiError("REVIEW_INVALID", error.message, 400);
    return apiError("REVIEW_INVALID", "Nội dung duyệt không hợp lệ.", 400);
  }

  // The user can correct text/answers, but cannot attach arbitrary media from
  // another ingestion or publish a source PDF.
  const audioIds = ingestionAudioIds(reviewedData);
  const attachedAudio = allowedIngestionAudioIds(job.result, job.audioAssetId);
  if (audioIds.length > MAX_INGESTION_AUDIO || audioIds.some(id => !attachedAudio.has(id))) {
    return apiError("MEDIA_NOT_ALLOWED", "Hãy gắn audio vào đúng tác vụ trước khi gửi duyệt.", 400);
  }
  if (audioIds.length) {
    const ready = await prisma.uploadedAsset.count({ where: { id: { in: audioIds }, ownerId: user.id, kind: "AUDIO", status: "READY" } });
    if (ready !== audioIds.length) return apiError("MEDIA_NOT_ALLOWED", "Audio không còn sẵn sàng hoặc không thuộc tài khoản này.", 400);
  }
  const imageIds = ingestionImageIds(reviewedData);
  const attachedIds = new Set(ingestionImageIds(job.result));
  if (imageIds.length > MAX_INGESTION_IMAGES || imageIds.some(id => !attachedIds.has(id))) {
    return apiError("MEDIA_NOT_ALLOWED", "Hãy gắn ảnh vào đúng tác vụ trước khi gửi duyệt.", 400);
  }
  if (imageIds.length) {
    const ready = await prisma.uploadedAsset.count({ where: { id: { in: imageIds }, ownerId: user.id, kind: "IMAGE", status: "READY" } });
    if (ready !== imageIds.length) return apiError("MEDIA_NOT_ALLOWED", "Ảnh không còn sẵn sàng hoặc không thuộc tài khoản này.", 400);
  }

  const existing = await prisma.contentContribution.findUnique({
    where: { sourceJobId: job.id },
    select: { id: true, status: true },
  });
  if (existing) return apiError("ALREADY_SUBMITTED", "Bộ đề này đã được gửi đóng góp.", 409);

  try {
    const contribution = await prisma.$transaction(async tx => {
      const locked = await tx.ingestionJob.updateMany({
        where: { id: job.id, ownerId: user.id, updatedAt: job.updatedAt, status: { in: ["COMPLETED", "IMPORTED"] }, contribution: { is: null } },
        data: { updatedAt: new Date(Math.max(Date.now(), job.updatedAt.getTime() + 1)) },
      });
      if (locked.count !== 1) throw new Error("JOB_CHANGED");
      return tx.contentContribution.create({
        data: { ownerId: user.id, sourceJobId: job.id, data: reviewedData },
        select: { id: true, status: true, createdAt: true },
      });
    });
    return apiJson({ contribution, questionsSubmitted: contributionQuestionCount(reviewedData) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "JOB_CHANGED") {
      return apiError("JOB_CHANGED", "Tài liệu vừa thay đổi hoặc đã gửi duyệt. Hãy mở lại trước khi gửi.", 409);
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return apiError("ALREADY_SUBMITTED", "Bộ đề này đã được gửi đóng góp.", 409);
    }
    console.error("contribution submit failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return apiError("SUBMIT_FAILED", "Không thể gửi đóng góp lúc này.", 500);
  }
}
