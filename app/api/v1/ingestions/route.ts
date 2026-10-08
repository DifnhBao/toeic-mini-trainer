import { after } from "next/server";
import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { consumeDailyAiCall } from "@/app/lib/ai-usage";
import { MAX_INGESTION_PAGES } from "@/app/lib/ingestion-limits";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { prisma } from "@/app/lib/prisma";
import { takeRateLimit } from "@/app/lib/rate-limit";
import { requestUser } from "@/app/lib/request-user";
import { processIngestionJob } from "@/app/lib/toeic-ingestion";
import { hasRole } from "@/app/lib/authorization";

export const runtime = "nodejs";
export const maxDuration = 300;

const createJobSchema = z
  .object({
    documentAssetId: z.string().uuid(),
    audioAssetId: z.string().uuid().nullable().optional(),
    pageStart: z.number().int().min(1).max(1_000).default(1),
    pageEnd: z.number().int().min(1).max(1_000).nullable().optional(),
  })
  .strict()
  .refine(({ pageStart, pageEnd }) => pageEnd == null ||
    (pageEnd >= pageStart && pageEnd - pageStart + 1 <= MAX_INGESTION_PAGES), {
    message: `Mỗi lần chỉ phân tích tối đa ${MAX_INGESTION_PAGES} trang liên tiếp.`,
  });

// Metadata only, always scoped to the authenticated owner. Opening a job
// uses the existing detail endpoint and never starts another AI request.
export async function GET(request: Request) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  const jobs = await prisma.ingestionJob.findMany({
    where: { ownerId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    select: {
      id: true, status: true, createdAt: true, pageStart: true, pageEnd: true,
      documentAsset: { select: { originalName: true } },
    },
  });
  return apiJson({ jobs });
}

export async function POST(request: Request) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(user, "ADMIN")) return apiError("ADMIN_CONTENT_ONLY", "Quản trị viên chuẩn bị đề và audio trên web. Bạn hãy chọn bài trong Kho bài.", 403);

  const limit = await takeRateLimit(request, `ingestion-create:${user.id}`, 10, 60 * 60_000);
  if (limit.unavailable) return apiError("RATE_LIMIT_UNAVAILABLE", "Dịch vụ tạm thời không sẵn sàng. Hãy thử lại sau.", 503, { "Retry-After": String(limit.retryAfterSeconds) });
  if (!limit.allowed) {
    return apiError("RATE_LIMITED", "Bạn tạo quá nhiều tác vụ nhập đề.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const body = await parseBoundedJson(request, createJobSchema);
  if (!body.success) return body.response;

  const assets = await prisma.uploadedAsset.findMany({
    where: {
      id: { in: [body.data.documentAssetId, ...(body.data.audioAssetId ? [body.data.audioAssetId] : [])] },
      ownerId: user.id,
      status: "READY",
    },
    select: { id: true, kind: true },
  });
  const documentAsset = assets.find((asset) => asset.id === body.data.documentAssetId);
  const audioAsset = body.data.audioAssetId
    ? assets.find((asset) => asset.id === body.data.audioAssetId)
    : null;
  if (documentAsset?.kind !== "DOCUMENT") {
    return apiError("DOCUMENT_ASSET_INVALID", "PDF chưa sẵn sàng hoặc không thuộc tài khoản.", 400);
  }
  if (body.data.audioAssetId && audioAsset?.kind !== "AUDIO") {
    return apiError("AUDIO_ASSET_INVALID", "Audio chưa sẵn sàng hoặc không thuộc tài khoản.", 400);
  }

  // Unlike an in-memory rate limiter, this quota survives Vercel instances
  // and bounds the number of potentially paid PDF extraction calls per user.
  try {
    const allowed = await consumeDailyAiCall(user.id, "ingestion", user.role === "ADMIN" ? 10 : 3);
    if (!allowed) return apiError("AI_DAILY_LIMIT", "Bạn đã dùng hết lượt nhập tài liệu hôm nay.", 429);
  } catch {
    return apiError("AI_UNAVAILABLE", "Chưa thể kiểm tra hạn mức nhập tài liệu.", 503);
  }

  const job = await prisma.ingestionJob.create({
    data: {
      ownerId: user.id,
      documentAssetId: documentAsset.id,
      audioAssetId: audioAsset?.id || null,
      pageStart: body.data.pageStart,
      pageEnd: body.data.pageEnd ?? null,
    },
    select: { id: true, status: true, createdAt: true },
  });

  after(() => processIngestionJob(job.id));
  return apiJson(
    { job: { ...job, createdAt: job.createdAt.toISOString() } },
    { status: 202 },
  );
}
