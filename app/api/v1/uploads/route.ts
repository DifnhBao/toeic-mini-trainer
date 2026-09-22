import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import {
  createStagingObjectKey,
  createSignedUploadUrl,
  ObjectStorageConfigurationError,
  UPLOAD_URL_TTL_SECONDS,
} from "@/app/lib/object-storage";
import { takeRateLimit } from "@/app/lib/rate-limit";
import {
  sanitizeOriginalName,
  uploadKinds,
  validateUploadDescriptor,
} from "@/app/lib/upload-policy";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";

export const runtime = "nodejs";

const uploadIntentSchema = z
  .object({
    kind: z.enum(uploadKinds),
    fileName: z.string().trim().min(1).max(500),
    contentType: z.string().trim().min(1).max(120),
    sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
  })
  .strict();

export async function POST(request: Request) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const limit = takeRateLimit(request, `mobile-upload-intent:${user.id}`, 20, 10 * 60_000);
  if (!limit.allowed) {
    return apiError("RATE_LIMITED", "Bạn tạo yêu cầu upload quá nhanh.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const body = await parseBoundedJson(request, uploadIntentSchema);
  if (!body.success) return body.response;

  const policy = validateUploadDescriptor(body.data);
  if (!policy.valid) {
    const message = policy.code === "FILE_TOO_LARGE"
      ? "File vượt quá kích thước cho phép."
      : "Loại hoặc kích thước file không hợp lệ.";
    return apiError(policy.code, message, 400);
  }

  const id = randomUUID();
  const objectKey = createStagingObjectKey(user.id, body.data.kind, policy.extension);

  try {
    // URL is created before the row, but is only disclosed after the row exists.
    // Signing does not upload or otherwise mutate the bucket.
    const uploadUrl = await createSignedUploadUrl(
      objectKey,
      policy.contentType,
      body.data.sizeBytes,
    );
    await prisma.uploadedAsset.create({
      data: {
        id,
        ownerId: user.id,
        kind: body.data.kind,
        objectKey,
        originalName: sanitizeOriginalName(body.data.fileName),
        contentType: policy.contentType,
        sizeBytes: body.data.sizeBytes,
      },
    });

    return apiJson(
      {
        asset: { id, kind: body.data.kind, status: "PENDING" as const },
        upload: {
          method: "PUT" as const,
          url: uploadUrl,
          headers: { "Content-Type": policy.contentType },
          expiresIn: UPLOAD_URL_TTL_SECONDS,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ObjectStorageConfigurationError) {
      return apiError("STORAGE_UNAVAILABLE", "Kho file chưa được cấu hình.", 503);
    }
    console.error("create upload intent failed", error);
    return apiError("UPLOAD_INTENT_FAILED", "Không thể chuẩn bị upload.", 503);
  }
}
