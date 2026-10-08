import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import {
  createSignedReadUrl,
  ObjectStorageConfigurationError,
  READ_URL_TTL_SECONDS,
} from "@/app/lib/object-storage";
import { prisma } from "@/app/lib/prisma";
import { takeRateLimit } from "@/app/lib/rate-limit";
import { requestUser } from "@/app/lib/request-user";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const limit = await takeRateLimit(request, `mobile-asset-read:${user.id}`, 120, 60_000);
  if (limit.unavailable) return apiError("RATE_LIMIT_UNAVAILABLE", "Dịch vụ tạm thời không sẵn sàng. Hãy thử lại sau.", 503, { "Retry-After": String(limit.retryAfterSeconds) });
  if (!limit.allowed) {
    return apiError("RATE_LIMITED", "Bạn yêu cầu file quá nhanh.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return apiError("INVALID_ASSET_ID", "Mã file không hợp lệ.", 400);

  const asset = await prisma.uploadedAsset.findFirst({
    where: { id: parsedId.data, ownerId: user.id, status: "READY" },
    select: { id: true, kind: true, contentType: true, sizeBytes: true, objectKey: true },
  });
  if (!asset) return apiError("ASSET_NOT_FOUND", "Không tìm thấy file sẵn sàng để đọc.", 404);

  try {
    const url = await createSignedReadUrl(asset.objectKey, asset.kind);
    return apiJson({
      asset: {
        id: asset.id,
        kind: asset.kind,
        contentType: asset.contentType,
        sizeBytes: asset.sizeBytes,
        url,
        expiresIn: READ_URL_TTL_SECONDS,
      },
    });
  } catch (error) {
    if (error instanceof ObjectStorageConfigurationError) {
      return apiError("STORAGE_UNAVAILABLE", "Kho file chưa được cấu hình.", 503);
    }
    console.error("create asset read URL failed", error);
    return apiError("ASSET_READ_FAILED", "Không thể mở file.", 503);
  }
}
