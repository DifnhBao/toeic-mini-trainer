import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { mobileUserFromRequest } from "@/app/lib/mobile-auth";
import { prisma } from "@/app/lib/prisma";
import { resolveQuestionGroupMedia } from "@/app/lib/object-storage";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await mobileUserFromRequest(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return apiError("INVALID_TEST_ID", "Mã bài luyện không hợp lệ.", 400);

  const test = await prisma.miniTest.findFirst({
    where: { id: parsedId.data, createdById: user.id },
    select: {
      id: true,
      title: true,
      createdAt: true,
      questions: {
        orderBy: { orderIndex: "asc" },
        select: {
          orderIndex: true,
          question: {
            select: {
              id: true,
              part: true,
              content: true,
              options: true,
              group: {
                select: {
                  id: true,
                  groupType: true,
                  passageText: true,
                  audioUrl: true,
                  imageUrl: true,
                  audioAsset: { select: { objectKey: true, kind: true, status: true, ownerId: true } },
                  imageAsset: { select: { objectKey: true, kind: true, status: true, ownerId: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!test) return apiError("TEST_NOT_FOUND", "Không tìm thấy bài luyện.", 404);
  const questions = await Promise.all(
    test.questions.map(async (item) => ({
      ...item,
      question: {
        ...item.question,
        group: await resolveQuestionGroupMedia(item.question.group, user.id),
      },
    })),
  );
  return apiJson({ test: { ...test, questions } });
}
