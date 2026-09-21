import { apiJson } from "@/app/lib/api-response";
import {
  enforceAuthRateLimit,
  logoutSchema,
  parseBoundedJson,
} from "@/app/lib/mobile-api";
import { revokeRefreshToken } from "@/app/lib/mobile-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "mobile-logout", 20);
  if (limited) return limited;

  const body = await parseBoundedJson(request, logoutSchema);
  if (!body.success) return body.response;

  // Logout is intentionally idempotent and never reveals whether a token exists.
  await revokeRefreshToken(body.data.refreshToken).catch(() => undefined);
  return apiJson({ success: true });
}
