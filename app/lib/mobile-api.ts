import { z } from "zod";
import { apiError } from "@/app/lib/api-response";
import { takeRateLimit } from "@/app/lib/rate-limit";

const MAX_JSON_BYTES = 24 * 1024;

export const deviceSchema = {
  deviceId: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/, "deviceId contains unsupported characters"),
  deviceName: z.string().trim().min(1).max(120).optional(),
};

export const providerSignInSchema = z.object({
  idToken: z.string().min(100).max(20_000),
  ...deviceSchema,
  name: z.string().trim().min(1).max(120).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(40).max(256).regex(/^[A-Za-z0-9_-]+$/),
  deviceId: deviceSchema.deviceId,
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(40).max(256).regex(/^[A-Za-z0-9_-]+$/),
});

export async function parseBoundedJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ success: true; data: z.infer<T> } | { success: false; response: Response }> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return {
      success: false,
      response: apiError("UNSUPPORTED_MEDIA_TYPE", "Yêu cầu phải dùng JSON.", 415),
    };
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    return {
      success: false,
      response: apiError("PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên quá lớn.", 413),
    };
  }

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
      return {
        success: false,
        response: apiError("PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên quá lớn.", 413),
      };
    }

    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      return {
        success: false,
        response: apiError("INVALID_REQUEST", "Dữ liệu gửi lên không hợp lệ.", 400),
      };
    }
    return { success: true, data: parsed.data };
  } catch {
    return {
      success: false,
      response: apiError("INVALID_JSON", "Không thể đọc dữ liệu JSON.", 400),
    };
  }
}

export function enforceAuthRateLimit(request: Request, scope: string, limit = 12) {
  const result = takeRateLimit(request, scope, limit, 60_000);
  if (result.allowed) return null;

  return apiError("RATE_LIMITED", "Bạn thao tác quá nhanh. Vui lòng thử lại sau.", 429, {
    "Retry-After": String(result.retryAfterSeconds),
  });
}

export function isMobileAuthConfigurationError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.startsWith("MOBILE_JWT_SECRET") ||
      error.message.startsWith("OAuth client audience"))
  );
}
