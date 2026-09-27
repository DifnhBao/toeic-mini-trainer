import { apiError, apiJson } from "@/app/lib/api-response";
import {
  enforceAuthRateLimit,
  isMobileAuthConfigurationError,
  parseBoundedJson,
  providerSignInSchema,
} from "@/app/lib/mobile-api";
import {
  createMobileSession,
  resolveMobileUser,
  verifyGoogleIdentity,
} from "@/app/lib/mobile-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "mobile-google");
  if (limited) return limited;

  const body = await parseBoundedJson(request, providerSignInSchema.omit({ name: true }));
  if (!body.success) return body.response;

  let identity;
  try {
    identity = await verifyGoogleIdentity(body.data.idToken);
  } catch (error) {
    if (isMobileAuthConfigurationError(error)) {
      return apiError("AUTH_NOT_CONFIGURED", "Đăng nhập mobile chưa được cấu hình.", 503);
    }
    return apiError("INVALID_IDENTITY", "Không thể xác minh tài khoản Google.", 401);
  }

  try {
    const user = await resolveMobileUser(identity);
    const tokens = await createMobileSession(
      user.id,
      body.data.deviceId,
      body.data.deviceName,
    );

    return apiJson({
      user: { id: user.id, name: user.name, email: user.email, image: user.image },
      tokens,
    });
  } catch (error) {
    console.error("mobile Google session creation failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return apiError("AUTH_SERVICE_UNAVAILABLE", "Đăng nhập tạm thời không khả dụng.", 503);
  }
}
