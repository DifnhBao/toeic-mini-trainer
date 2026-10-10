import { apiError, apiJson } from "@/app/lib/api-response";
import {
  enforceAuthRateLimit,
  isMobileAuthConfigurationError,
  parseBoundedJson,
  providerSignInSchema,
} from "@/app/lib/mobile-api";
import {
  AccountSuspendedError,
  AccountLinkRequiredError,
  createMobileSession,
  resolveMobileUser,
  verifyAppleIdentity,
} from "@/app/lib/mobile-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await enforceAuthRateLimit(request, "mobile-apple");
  if (limited) return limited;

  const body = await parseBoundedJson(request, providerSignInSchema);
  if (!body.success) return body.response;

  try {
    const identity = await verifyAppleIdentity(body.data.idToken, body.data.name);
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
    if (error instanceof AccountLinkRequiredError) {
      return apiError("ACCOUNT_LINK_REQUIRED", "Email này đã có tài khoản. Hãy đăng nhập bằng phương thức ban đầu.", 409);
    }
    if (error instanceof AccountSuspendedError) {
      return apiError("ACCOUNT_SUSPENDED", "Tài khoản đã bị tạm khóa.", 403);
    }
    if (isMobileAuthConfigurationError(error)) {
      return apiError("AUTH_NOT_CONFIGURED", "Đăng nhập mobile chưa được cấu hình.", 503);
    }
    return apiError("INVALID_IDENTITY", "Không thể xác minh tài khoản Apple.", 401);
  }
}
