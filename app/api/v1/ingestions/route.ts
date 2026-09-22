import { after } from "next/server";
import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { prisma } from "@/app/lib/prisma";
import { takeRateLimit } from "@/app/lib/rate-limit";
import { requestUser } from "@/app/lib/request-user";
import { processIngestionJob } from "@/app/lib/toeic-ingestion";

export const runtime = "nodejs";
export const maxDuration = 300;

const createJobSchema = z
  .object({
    documentAssetId: z.string().uuid(),
    audioAssetId: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function POST(request: Request) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const limit = takeRateLimit(request, `ingestion-create:${user.id}`, 10, 60 * 60_000);
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

  const job = await prisma.ingestionJob.create({
    data: {
      ownerId: user.id,
      documentAssetId: documentAsset.id,
      audioAssetId: audioAsset?.id || null,
    },
    select: { id: true, status: true, createdAt: true },
  });

  after(() => processIngestionJob(job.id));
  return apiJson(
    { job: { ...job, createdAt: job.createdAt.toISOString() } },
    { status: 202 },
  );
}
