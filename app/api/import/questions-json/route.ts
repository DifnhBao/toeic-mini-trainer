import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { importExtractedQuestions } from "@/app/lib/question-import";
import { requestUser } from "@/app/lib/request-user";
import { hasRole } from "@/app/lib/authorization";
import { apiError } from "@/app/lib/api-response";

export const runtime = "nodejs";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await requestUser(request);
  if (!user) {
    return NextResponse.json(
      { error: "Vui lòng đăng nhập để cập nhật kho câu hỏi." },
      { status: 401 },
    );
  }

  if (!hasRole(user, "ADMIN")) return apiError("ADMIN_CONTENT_ONLY", "Chỉ quản trị viên được nhập nội dung mới. Bạn hãy chọn bài trong Kho bài.", 403);

  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) {
    return NextResponse.json({ error: "Yêu cầu phải dùng JSON." }, { status: 415 });
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: "File JSON vượt quá 5 MB." }, { status: 413 });
  }

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
      return NextResponse.json({ error: "File JSON vượt quá 5 MB." }, { status: 413 });
    }
    const questionsAdded = await importExtractedQuestions(user.id, JSON.parse(text));
    return NextResponse.json(
      { message: "Import thành công", questionsAdded },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return NextResponse.json(
        { error: "Dữ liệu câu hỏi không đúng định dạng hoặc vượt giới hạn." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "ASSET_OWNERSHIP_INVALID") {
      return NextResponse.json(
        { error: "File đính kèm không sẵn sàng hoặc không thuộc tài khoản." },
        { status: 403 },
      );
    }
    console.error("question import failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "Không thể lưu dữ liệu; giao dịch đã được hoàn tác." },
      { status: 500 },
    );
  }
}
