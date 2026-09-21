import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

export async function GET(
  request: Request,
  // Thêm Promise vào kiểu dữ liệu của params
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Vui lòng đăng nhập để mở bài luyện." }, { status: 401 });
    }

    // THÊM AWAIT Ở ĐÂY
    const resolvedParams = await params;
    const testId = resolvedParams.id;

    const test = await prisma.miniTest.findUnique({
      where: { id: testId },
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

    return NextResponse.json(test, { status: 200 });
  } catch (error) {
    console.error("Lỗi lấy test:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
