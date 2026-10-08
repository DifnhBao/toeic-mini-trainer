import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import {
  deleteStoredObject,
  createReadyObjectKey,
  ObjectNotReadyError,
  ObjectStorageConfigurationError,
  promoteStoredObject,
  verifyStoredObject,
} from "@/app/lib/object-storage";
import { prisma } from "@/app/lib/prisma";
import { takeRateLimit } from "@/app/lib/rate-limit";
import { requestUser } from "@/app/lib/request-user";
import { hasRole } from "@/app/lib/authorization";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(user, "ADMIN")) return apiError("ADMIN_CONTENT_ONLY", "Chỉ quản trị viên được nhập đề và audio trên web.", 403);

  const limit = await takeRateLimit(request, `mobile-upload-complete:${user.id}`, 30, 10 * 60_000);
  if (limit.unavailable) return apiError("RATE_LIMIT_UNAVAILABLE", "Dịch vụ tạm thời không sẵn sàng. Hãy thử lại sau.", 503, { "Retry-After": String(limit.retryAfterSeconds) });
  if (!limit.allowed) {
    return apiError("RATE_LIMITED", "Bạn xác nhận upload quá nhanh.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return apiError("INVALID_ASSET_ID", "Mã file không hợp lệ.", 400);

  const asset = await prisma.uploadedAsset.findFirst({
    where: { id: parsedId.data, ownerId: user.id },
  });
  if (!asset) return apiError("ASSET_NOT_FOUND", "Không tìm thấy file.", 404);
  if (asset.status === "READY") return apiJson({ asset: { id: asset.id, status: asset.status } });
  if (asset.status === "REJECTED") {
    return apiError("ASSET_REJECTED", "File đã bị từ chối kiểm duyệt.", 409);
  }

  try {
    const verification = await verifyStoredObject(asset);
    if (!verification.valid) {
      await deleteStoredObject(asset.objectKey).catch((deleteError) => {
        console.error("invalid upload cleanup failed", deleteError);
      });
      await prisma.uploadedAsset.updateMany({
        where: { id: asset.id, ownerId: user.id, status: "PENDING" },
        data: { status: "REJECTED", failureCode: verification.code },
      });
      return apiError("ASSET_VALIDATION_FAILED", "Nội dung file không khớp khai báo.", 422);
    }

    const readyObjectKey = createReadyObjectKey(asset.objectKey);
    await promoteStoredObject(asset.objectKey, readyObjectKey, verification.sourceEtag);
    const promoted = await prisma.uploadedAsset.updateMany({
      where: { id: asset.id, ownerId: user.id, status: "PENDING" },
      data: {
        status: "READY",
        objectKey: readyObjectKey,
        etag: verification.etag,
        failureCode: null,
        verifiedAt: new Date(),
      },
    });
    if (promoted.count > 0) {
      await deleteStoredObject(asset.objectKey).catch((deleteError) => {
        console.error("staging upload cleanup failed", deleteError);
      });
    }
    return apiJson({ asset: { id: asset.id, status: "READY" as const } });
  } catch (error) {
    if (error instanceof ObjectNotReadyError) {
      return apiError("UPLOAD_NOT_READY", "File chưa upload xong.", 409, { "Retry-After": "2" });
    }
    if (error instanceof ObjectStorageConfigurationError) {
      return apiError("STORAGE_UNAVAILABLE", "Kho file chưa được cấu hình.", 503);
    }
    console.error("complete upload failed", error);
    return apiError("UPLOAD_VERIFICATION_FAILED", "Không thể xác minh file.", 503);
  }
}
