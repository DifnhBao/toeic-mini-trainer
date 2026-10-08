import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { requestUser } from "@/app/lib/request-user";
import { createSharedLibraryTest } from "@/app/lib/shared-library";
import { takeRateLimit } from "@/app/lib/rate-limit";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return apiError("INVALID_LESSON_ID", "Mã bài không hợp lệ.", 400);
  const limit = await takeRateLimit(request, `mobile-test-create:${user.id}`, 20, 60_000);
  if (limit.unavailable) return apiError("RATE_LIMIT_UNAVAILABLE", "Chưa thể tạo bài. Hãy thử lại sau.", 503, { "Retry-After": String(limit.retryAfterSeconds) });
  if (!limit.allowed) return apiError("RATE_LIMITED", "Bạn tạo bài quá nhanh.", 429, { "Retry-After": String(limit.retryAfterSeconds) });
  const test = await createSharedLibraryTest(user.id, id.data);
  if (!test) return apiError("LESSON_UNAVAILABLE", "Bài đã được ẩn hoặc cần tách thành nhóm tối đa 50 câu. Hãy tải lại kho bài.", 404);
  return apiJson({ test }, { status: 201 });
}
