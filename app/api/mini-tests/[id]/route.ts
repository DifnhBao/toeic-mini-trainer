import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { resolveQuestionGroupMedia } from "@/app/lib/object-storage";
import { requestUser } from "@/app/lib/request-user";

export async function GET(
  request: Request,
  // Thêm Promise vào kiểu dữ liệu của params
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Vui lòng đăng nhập để mở bài luyện." }, { status: 401 });
    }

    // THÊM AWAIT Ở ĐÂY
    const resolvedParams = await params;
    const testId = resolvedParams.id;

    const test = await prisma.miniTest.findFirst({
      where: {
        id: testId,
        createdById: user.id,
      },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
          include: {
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
                    contribution: { select: { status: true } },
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

    if (!test) {
      return NextResponse.json(
        { error: "Không tìm thấy bài test" },
        { status: 404 },
      );
    }

    const questions = await Promise.all(
      test.questions.map(async (item) => ({
        ...item,
        question: {
          ...item.question,
          group: await resolveQuestionGroupMedia(item.question.group, user.id),
        },
      })),
    );
    return NextResponse.json({ ...test, questions }, { status: 200 });
  } catch (error) {
    console.error("Lỗi lấy test:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
