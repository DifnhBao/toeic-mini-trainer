import { after } from "next/server";
import { REQUEST_ID_HEADER } from "@/app/lib/request-trace";
import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { prisma } from "@/app/lib/prisma";
import { takeRateLimit } from "@/app/lib/rate-limit";
import { requestUser } from "@/app/lib/request-user";
import { processIngestionJob } from "@/app/lib/toeic-ingestion";
import { hasRole } from "@/app/lib/authorization";

export const runtime = "nodejs";
export const maxDuration = 300;

const idSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(user, "ADMIN")) return apiError("ADMIN_CONTENT_ONLY", "Chỉ quản trị viên được xử lý lại tài liệu trên web.", 403);

  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return apiError("INVALID_JOB_ID", "Mã tác vụ không hợp lệ.", 400);
  const limit = await takeRateLimit(request, `ingestion-retry:${user.id}`, 5, 60 * 60_000);
  if (limit.unavailable) return apiError("RATE_LIMIT_UNAVAILABLE", "Dịch vụ tạm thời không sẵn sàng. Hãy thử lại sau.", 503, { "Retry-After": String(limit.retryAfterSeconds) });
  if (!limit.allowed) return apiError("RATE_LIMITED", "Bạn thử lại quá nhiều lần.", 429, { "Retry-After": String(limit.retryAfterSeconds) });

  const reset = await prisma.ingestionJob.updateMany({
    where: { id: parsedId.data, ownerId: user.id, status: "FAILED", attemptCount: { lt: 3 } },
    data: { status: "PENDING", errorCode: null, completedAt: null },
  });
  if (reset.count !== 1) {
    return apiError("JOB_NOT_RETRYABLE", "Tác vụ không thể thử lại hoặc đã quá 3 lần.", 409);
  }

  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? undefined;
  after(() => processIngestionJob(parsedId.data, undefined, requestId));
  return apiJson({ job: { id: parsedId.data, status: "PENDING" as const } }, { status: 202 });
}
