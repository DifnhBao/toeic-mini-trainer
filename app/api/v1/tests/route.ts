import { randomInt } from "node:crypto";
import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { mobileUserFromRequest } from "@/app/lib/mobile-auth";
import { prisma } from "@/app/lib/prisma";
import { takeRateLimit } from "@/app/lib/rate-limit";

export const runtime = "nodejs";

const generateTestSchema = z.object({
  count: z.number().int().min(5).max(50),
  parts: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(
    (parts) => new Set(parts).size === parts.length,
    "Parts must be unique",
  ),
});

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export async function POST(request: Request) {
  const user = await mobileUserFromRequest(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const limit = takeRateLimit(request, `mobile-test-create:${user.id}`, 20, 60_000);
  if (!limit.allowed) {
    return apiError("RATE_LIMITED", "Bạn tạo bài quá nhanh. Vui lòng thử lại sau.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const body = await parseBoundedJson(request, generateTestSchema);
  if (!body.success) return body.response;

  const available = await prisma.question.findMany({
    where: {
      part: { in: body.data.parts },
      OR: [{ ownerId: null }, { ownerId: user.id }],
    },
    select: { id: true, part: true },
  });
  if (available.length === 0) {
    return apiError("NO_QUESTIONS", "Kho câu hỏi chưa có dữ liệu cho phần đã chọn.", 422);
  }

  const selected = shuffle(available).slice(0, body.data.count);
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
