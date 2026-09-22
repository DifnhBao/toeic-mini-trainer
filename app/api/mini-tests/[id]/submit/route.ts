import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";

const submitSchema = z
  .object({
    answers: z
      .record(z.string().uuid(), z.enum(["A", "B", "C", "D"]))
      .refine((answers) => Object.keys(answers).length <= 50, "Too many answers"),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 1. Xác thực người dùng đang đăng nhập
    const user = await requestUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Vui lòng đăng nhập để nộp bài" },
        { status: 401 },
      );
    }

    // 2. Lấy dữ liệu bài nộp từ Client
    const resolvedParams = await params;
    const testId = resolvedParams.id;
    const body = await parseBoundedJson(request, submitSchema);
    if (!body.success) return body.response;
    const { answers } = body.data; // format: { "q_id_1": "A", "q_id_2": "C" }

    // 3. Lấy bài test và tất cả đáp án đúng từ DB
    const test = await prisma.miniTest.findFirst({
      where: { id: testId, createdById: user.id },
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
