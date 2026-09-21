import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Vui lòng đăng nhập để cập nhật kho câu hỏi." }, { status: 401 });
    }

    const body = await request.json();
    const { data } = body;

    if (!data || !Array.isArray(data)) {
      return NextResponse.json(
        { error: 'Định dạng JSON không hợp lệ. Cần có mảng "data".' },
        { status: 400 },
      );
    }

    let questionsAdded = 0;

    // Sử dụng Interactive Transaction của Prisma để bảo vệ tính toàn vẹn dữ liệu
    await prisma.$transaction(
      async (tx) => {
        for (const item of data) {
          let groupId = null;

          // 1. Tạo Group nếu có (Dùng cho Part 3, 4, 6, 7)
          if (item.group) {
            const newGroup = await tx.questionGroup.create({
              data: {
                groupType: item.group.groupType || "TEXT",
                audioUrl: item.group.audioUrl || null,
                imageUrl: item.group.imageUrl || null,
                passageText: item.group.passageText || null,
              },
            });
            groupId = newGroup.id;
          }

          // 2. Tạo các câu hỏi thuộc group này (hoặc câu độc lập nếu groupId = null)
          if (item.questions && Array.isArray(item.questions)) {
            for (const q of item.questions) {
              // Ép kiểu an toàn (Input Validation cơ bản)
              const part = Number(q.part);
              const correctAnswer = String(q.correctAnswer || "").toUpperCase();
              if (!Number.isInteger(part) || part < 1 || part > 7 || !["A", "B", "C", "D"].includes(correctAnswer) || !q.options || typeof q.options !== "object") {
                throw new Error(
                  `Câu hỏi không hợp lệ: Part phải từ 1–7, đáp án phải là A–D và cần có options.`,
                );
              }

              await tx.question.create({
                data: {
                  groupId: groupId,
                  part,
                  content: q.content || null,
                  options: q.options || {},
                  correctAnswer,
                },
              });
              questionsAdded++;
            }
          }
        }
      },
      { maxWait: 5000, timeout: 20000 },
    ); // Kết thúc Transaction

    return NextResponse.json(
      { message: "Import thành công", questionsAdded },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Lỗi import JSON:", error);
    // Trả về chính xác thông báo lỗi để hiển thị lên Frontend
    return NextResponse.json(
      {
        error:
          error.message ||
          "Xảy ra lỗi trong quá trình lưu dữ liệu, đã tự động hoàn tác.",
      },
      { status: 500 },
    );
  }
}
