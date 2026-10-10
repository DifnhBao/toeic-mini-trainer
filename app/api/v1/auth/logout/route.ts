import { apiError, apiJson } from "@/app/lib/api-response";
import {
  enforceAuthRateLimit,
  logoutSchema,
  parseBoundedJson,
} from "@/app/lib/mobile-api";
import { revokeRefreshToken } from "@/app/lib/mobile-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await enforceAuthRateLimit(request, "mobile-logout", 20);
  if (limited) return limited;

  const body = await parseBoundedJson(request, logoutSchema);
  if (!body.success) return body.response;

  // Logout is intentionally idempotent and never reveals whether a token exists.
  try {
    await revokeRefreshToken(body.data.refreshToken);
    return apiJson({ success: true });
  } catch {
    return apiError("AUTH_UNAVAILABLE", "Không thể xác nhận thu hồi phiên đăng nhập. Vui lòng thử lại.", 503);
  }
}
