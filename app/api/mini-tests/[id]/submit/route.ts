import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 1. Xác thực người dùng đang đăng nhập
    const session = await auth();

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: "Vui lòng đăng nhập để nộp bài" },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Không tìm thấy thông tin tài khoản" },
        { status: 404 },
      );
    }

    // 2. Lấy dữ liệu bài nộp từ Client
    const resolvedParams = await params;
    const testId = resolvedParams.id;
    const body = await request.json();
    const { answers } = body; // format: { "q_id_1": "A", "q_id_2": "C" }

    // 3. Lấy bài test và tất cả đáp án đúng từ DB
    const test = await prisma.miniTest.findUnique({
      where: { id: testId },
      include: {
        questions: {
          include: { question: true },
        },
      },
    });

    if (!test)
      return NextResponse.json(
        { error: "Không tìm thấy bài test" },
        { status: 404 },
      );

    // 4. Chấm điểm
    let score = 0;
    const userAnswersData = [];

    for (const item of test.questions) {
      const q = item.question;
      const userSelected = answers[q.id] || null; // Nếu user không làm câu này thì là null
      const isCorrect = userSelected === q.correctAnswer;

      if (isCorrect) score += 1;

      userAnswersData.push({
        questionId: q.id,
        selectedOption: userSelected,
        isCorrect: isCorrect,
      });
    }

    // 5. Lưu kết quả vào Database cho USER THẬT
    const attempt = await prisma.testAttempt.create({
      data: {
        userId: user.id, // Dùng ID của tài khoản đang đăng nhập
        testId: testId,
        score: score,
        userAnswers: {
          create: userAnswersData,
        },
      },
    });

    return NextResponse.json({ attemptId: attempt.id, score }, { status: 200 });
  } catch (error) {
    console.error("Lỗi nộp bài:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
