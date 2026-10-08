import { apiError, apiJson } from "@/app/lib/api-response";
import { requestUser } from "@/app/lib/request-user";
import { learningSummary } from "@/app/lib/learning-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  return apiJson(await learningSummary(user.id));
}
