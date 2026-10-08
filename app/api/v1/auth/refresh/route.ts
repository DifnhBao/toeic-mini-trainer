import { apiError, apiJson } from "@/app/lib/api-response";
import {
  enforceAuthRateLimit,
  isMobileAuthConfigurationError,
  parseBoundedJson,
  refreshSchema,
} from "@/app/lib/mobile-api";
import { rotateRefreshToken } from "@/app/lib/mobile-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await enforceAuthRateLimit(request, "mobile-refresh", 20);
  if (limited) return limited;

  const body = await parseBoundedJson(request, refreshSchema);
  if (!body.success) return body.response;

  try {
    const tokens = await rotateRefreshToken(body.data.refreshToken, body.data.deviceId);
    if (!tokens) {
      return apiError("INVALID_REFRESH_TOKEN", "Phiên đăng nhập đã hết hạn.", 401);
    }
    return apiJson({ tokens });
  } catch (error) {
    if (isMobileAuthConfigurationError(error)) {
      return apiError("AUTH_NOT_CONFIGURED", "Đăng nhập mobile chưa được cấu hình.", 503);
    }
    return apiError("AUTH_UNAVAILABLE", "Không thể làm mới phiên đăng nhập.", 503);
  }
}
