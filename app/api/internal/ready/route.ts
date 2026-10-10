import { apiError, apiJson } from "@/app/lib/api-response";
import { requestLogFields } from "@/app/lib/request-trace";
import { checkObjectStorageReady } from "@/app/lib/object-storage";
import { prisma } from "@/app/lib/prisma";
import {
  isAuthorizedIngestionWorker,
  isIngestionWorkerConfigured,
} from "@/app/lib/worker-auth";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request: Request) {
  if (!isIngestionWorkerConfigured()) {
    return apiError("READINESS_NOT_CONFIGURED", "Readiness chưa được cấu hình.", 503);
  }
  if (!isAuthorizedIngestionWorker(request.headers.get("authorization"))) {
    return apiError("UNAUTHORIZED", "Không có quyền kiểm tra readiness.", 401);
  }

  const [database, storage] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    checkObjectStorageReady(),
  ]);
  if (database.status === "rejected" || storage.status === "rejected") {
    console.error("readiness check failed", {
      ...requestLogFields(request),
      database: database.status,
      storage: storage.status,
    });
    return apiError("NOT_READY", "Dịch vụ chưa sẵn sàng.", 503);
  }
  return apiJson({ ready: true });
}
