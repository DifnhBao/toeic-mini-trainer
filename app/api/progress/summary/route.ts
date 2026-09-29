import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";

export async function GET(request: Request) {
  try {
    // 1. Kiểm tra session đăng nhập hiện tại từ NextAuth
    const user = await requestUser(request);

    if (!user) {
      // Trả về lỗi 401 (Unauthorized) nếu chưa đăng nhập
      return NextResponse.json(
        { error: "Vui lòng đăng nhập để xem thống kê" },
        { status: 401 },
      );
    }

    // 2. Tìm user trong Database dựa vào email từ tài khoản Google
    // 3. Lấy toàn bộ lịch sử làm bài CỦA RIÊNG USER ĐANG ĐĂNG NHẬP
    const attempts = await prisma.testAttempt.findMany({
      where: { userId: user.id },
      include: {
        userAnswers: {
          include: { question: true },
        },
      },
    });

    const totalTests = attempts.length;
    if (totalTests === 0) {
      return NextResponse.json(
        { totalTests: 0, overallAccuracy: 0, partStats: [] },
        { status: 200 },
      );
    }

    let totalCorrect = 0;
    let totalQuestions = 0;

    // Gom nhóm thống kê theo Part
    const partData: Record<number, { correct: number; total: number }> = {};

    attempts.forEach((attempt) => {
      attempt.userAnswers.forEach((ua) => {
        totalQuestions++;
        if (ua.isCorrect) totalCorrect++;

        const part = ua.question.part;
        if (!partData[part]) partData[part] = { correct: 0, total: 0 };

        partData[part].total++;
        if (ua.isCorrect) partData[part].correct++;
      });
    });

    // Tính tỷ lệ chính xác (%)
    const overallAccuracy =
      totalQuestions > 0
        ? Math.round((totalCorrect / totalQuestions) * 100)
        : 0;

    // Format lại data để gửi xuống UI
    const partStats = Object.keys(partData)
      .map((part) => {
        const p = parseInt(part);
        const acc = Math.round((partData[p].correct / partData[p].total) * 100);
        return { part: p, accuracy: acc, total: partData[p].total };
      })
      .sort((a, b) => a.part - b.part); // Sắp xếp theo thứ tự Part 1 -> 7

    return NextResponse.json(
      { totalTests, overallAccuracy, partStats },
      { status: 200 },
    );
  } catch (error) {
    console.error("Lỗi lấy thống kê:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
