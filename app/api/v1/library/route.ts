import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { requestUser } from "@/app/lib/request-user";
import { sharedLibrary } from "@/app/lib/shared-library";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!await requestUser(request)) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  const cursor = z.string().uuid().optional().safeParse(new URL(request.url).searchParams.get("cursor") ?? undefined);
  if (!cursor.success) return apiError("INVALID_CURSOR", "Mã trang không hợp lệ.", 400);
  return apiJson(await sharedLibrary(cursor.data));
}
