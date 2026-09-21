import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Vui lòng đăng nhập để tạo bài luyện." },
        { status: 401 },
      );
    }

    let limit = 10;
    let part = "mixed"; // Trạng thái mặc định

    try {
      const body = await request.json();
      if (body.limit) limit = Number(body.limit);
      if (body.part) part = String(body.part); // Đọc tham số part từ UI gửi lên
    } catch (e) {
      // Bỏ qua nếu body trống
    }

    const finalLimit = Math.min(Math.max(limit, 5), 50);

    // 1. Tạo điều kiện lọc (where clause) cho Prisma
    const whereClause =
      part === "mixed"
        ? {}
        : part === "listening"
          ? { part: { in: [1, 2, 3, 4] } }
          : part === "reading"
            ? { part: { in: [5, 6, 7] } }
            : { part: Number(part) };

    // 2. Lấy danh sách ID câu hỏi theo điều kiện lọc
    const allQuestions = await prisma.question.findMany({
      where: whereClause,
      select: { id: true },
    });

    if (allQuestions.length === 0) {
      const partName = part === "mixed" ? "Tổng hợp" : part === "listening" ? "Listening" : part === "reading" ? "Reading" : `Part ${part}`;
      return NextResponse.json(
        { error: `Kho dữ liệu chưa có câu hỏi nào cho ${partName}!` },
        { status: 400 },
      );
    }

    // 3. Xáo trộn ngẫu nhiên và cắt mảng theo số lượng yêu cầu
    const shuffled = allQuestions.sort(() => 0.5 - Math.random());
    const selectedQuestions = shuffled.slice(0, finalLimit);
    const actualCount = selectedQuestions.length; // Lấy số lượng thực tế lỡ database ít hơn số lượng yêu cầu

    // 4. Tạo bản ghi bài thi mới với tựa đề chi tiết
    const titlePart = part === "mixed" ? "Tổng hợp" : part === "listening" ? "Listening" : part === "reading" ? "Reading" : `Part ${part}`;
    const testTitle = `Mini Test - ${new Date().toLocaleDateString("vi-VN")} (${titlePart}, ${actualCount} câu)`;

    const test = await prisma.miniTest.create({
      data: { title: testTitle },
    });

    // 5. Lưu vào bảng trung gian
    const testQuestionsData = selectedQuestions.map((q, index) => ({
      testId: test.id,
      questionId: q.id,
      orderIndex: index + 1,
    }));

    await prisma.miniTestQuestion.createMany({ data: testQuestionsData });

    return NextResponse.json({ testId: test.id }, { status: 201 });
  } catch (error) {
    console.error("Lỗi tạo đề:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
