import { apiError, apiJson } from "@/app/lib/api-response";
import { mobileUserFromRequest } from "@/app/lib/mobile-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await mobileUserFromRequest(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  return apiJson({ user });
}
