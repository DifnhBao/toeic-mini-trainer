import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { requestUser } from "@/app/lib/request-user";
import { selectPracticeQuestions } from "@/app/lib/learning-data";
import { prisma } from "@/app/lib/prisma";
import { takeRateLimit } from "@/app/lib/rate-limit";

export const runtime = "nodejs";

const generateTestSchema = z.object({
  count: z.number().int().min(5).max(50),
  parts: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(
    (parts) => new Set(parts).size === parts.length,
    "Parts must be unique",
  ),
}).strict();

export async function POST(request: Request) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const limit = await takeRateLimit(request, `mobile-test-create:${user.id}`, 20, 60_000);
  if (limit.unavailable) return apiError("RATE_LIMIT_UNAVAILABLE", "Dịch vụ tạm thời không sẵn sàng. Hãy thử lại sau.", 503, { "Retry-After": String(limit.retryAfterSeconds) });
  if (!limit.allowed) {
    return apiError("RATE_LIMITED", "Bạn tạo bài quá nhanh. Vui lòng thử lại sau.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const body = await parseBoundedJson(request, generateTestSchema);
  if (!body.success) return body.response;

  const selected = await selectPracticeQuestions(user.id, body.data.parts, body.data.count);
  if (selected.length === 0) {
    return apiError("NO_QUESTIONS", "Kho câu hỏi chưa có dữ liệu cho phần đã chọn.", 422);
  }

  const partsLabel = body.data.parts.length === 7
    ? "Tổng hợp"
    : body.data.parts.sort((a, b) => a - b).map((part) => `P${part}`).join(", ");

  const test = await prisma.miniTest.create({
    data: {
      title: `Mini Test · ${partsLabel} · ${selected.length} câu`,
      createdById: user.id,
      questions: {
        create: selected.map((question, index) => ({
          questionId: question.id,
          orderIndex: index + 1,
        })),
      },
    },
    select: { id: true, title: true },
  });

  return apiJson({ test }, { status: 201 });
}
