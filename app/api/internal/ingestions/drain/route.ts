import { safeErrorType } from "@/app/lib/server-error-log";
import { REQUEST_ID_HEADER, requestLogFields } from "@/app/lib/request-trace";
import { after } from "next/server";
import { apiError, apiJson } from "@/app/lib/api-response";
import { prisma } from "@/app/lib/prisma";
import { AI_LEASE_PREFIX } from "@/app/lib/ai-provider-capacity";
import { isIngestionPaused } from "@/app/lib/ingestion-limits";
import {
  isAuthorizedIngestionWorker,
  isIngestionWorkerConfigured,
} from "@/app/lib/worker-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const STALE_AFTER_MS = 10 * 60_000;

export async function POST(request: Request) {
  if (!isIngestionWorkerConfigured()) {
    return apiError("WORKER_NOT_CONFIGURED", "Worker chưa được cấu hình.", 503);
  }
  if (!isAuthorizedIngestionWorker(request.headers.get("authorization"))) {
    return apiError("UNAUTHORIZED", "Không có quyền chạy worker.", 401);
  }
  if (isIngestionPaused()) return apiJson({ queued: false, paused: true });

  try {
    // A Vercel invocation may be terminated before it can mark a job FAILED.
    // Requeue only after twice the maximum function lifetime has elapsed.
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
    const now = new Date();
    // The hourly, secret-protected sweep also expires anonymous/AI quota
    // counters; neither table contains learning history.
    await Promise.all([
      prisma.guestUsage.deleteMany({ where: { expiresAt: { lt: now } } }),
      // Active provider leases are expired by their own database-clock sweep.
      prisma.userAiUsage.deleteMany({ where: { expiresAt: { lt: now }, NOT: { key: { startsWith: AI_LEASE_PREFIX } } } }),
    ]);
    await prisma.ingestionJob.updateMany({
      where: { status: "PROCESSING", startedAt: { lt: staleBefore }, attemptCount: { lt: 3 } },
      data: { status: "PENDING", startedAt: null, completedAt: null, errorCode: null },
    });
    await prisma.ingestionJob.updateMany({
      where: {
        OR: [
          { status: "PROCESSING", startedAt: { lt: staleBefore }, attemptCount: { gte: 3 } },
          { status: "PENDING", attemptCount: { gte: 3 } },
        ],
      },
      data: { status: "FAILED", errorCode: "WORKER_INTERRUPTED", completedAt: now },
    });

    const candidate = await prisma.ingestionJob.findFirst({
      where: { status: "PENDING", attemptCount: { lt: 3 } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!candidate) return apiJson({ queued: false });

    // Respond promptly; Next/Vercel keeps the invocation alive for this task.
    // processIngestionJob atomically claims PENDING so concurrent triggers are safe.
    const requestId = request.headers.get(REQUEST_ID_HEADER) ?? undefined;
    after(async () => {
      const { processIngestionJob } = await import("@/app/lib/toeic-ingestion");
      await processIngestionJob(candidate.id, undefined, requestId);
    });
    return apiJson({ queued: true }, { status: 202 });
  } catch (error) {
    console.error("ingestion worker sweep failed", {
      ...requestLogFields(request),
      errorType: safeErrorType(error),
    });
    return apiError("WORKER_UNAVAILABLE", "Worker tạm thời không khả dụng.", 503);
  }
}
