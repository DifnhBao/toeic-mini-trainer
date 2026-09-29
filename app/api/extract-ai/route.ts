import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { randomUUID } from "crypto";
import { currentWebUser } from "@/app/lib/request-user";

const ai = new GoogleGenAI({});

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Endpoint upload trực tiếp đã ngừng hoạt động. Hãy dùng object storage." },
        { status: 410 },
      );
    }
    const user = await currentWebUser();
    if (!user) {
      return NextResponse.json({ error: "Vui lòng đăng nhập để nhập tài liệu." }, { status: 401 });
    }

    const formData = await request.formData();
    const documentFile = formData.get("document") as File | null;
    const audioFile = formData.get("audio") as File | null;

    if (!documentFile) {
      return NextResponse.json(
        { error: "Vui lòng upload file đề thi (PDF)" },
        { status: 400 },
      );
    }

    if (documentFile.type !== "application/pdf" || documentFile.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF không hợp lệ hoặc lớn hơn 15 MB." }, { status: 400 });
    }
    if (audioFile && (!audioFile.type.startsWith("audio/") || audioFile.size > 100 * 1024 * 1024)) {
      return NextResponse.json({ error: "Audio không hợp lệ hoặc lớn hơn 100 MB." }, { status: 400 });
    }

    // ---------------------------------------------------------
    // LỚP 1: LƯU AUDIO (Nếu có) VÀ BÓC TÁCH TEXT TỪ PDF
    // ---------------------------------------------------------
    let audioUrl = null;
    if (audioFile) {
      const bytes = await audioFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const uploadDir = path.join(process.cwd(), "public/uploads/audio");
      await mkdir(uploadDir, { recursive: true });

      const safeExtension = path.extname(audioFile.name).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".mp3";
      const fileName = `${randomUUID()}${safeExtension}`;
      await writeFile(path.join(uploadDir, fileName), buffer);
      audioUrl = `/uploads/audio/${fileName}`;
    }

    const docBuffer = Buffer.from(await documentFile.arrayBuffer());
    let rawText = "";

    try {
      // Dùng thuật toán cơ học đọc text từ PDF -> Đảm bảo không bị "ảo giác" chữ
      const pdfData = await pdf(docBuffer);
      rawText = pdfData.text;
    } catch {
      return NextResponse.json(
        {
          error:
            "Không thể đọc chữ từ file PDF này. Đảm bảo file không bị khóa.",
        },
        { status: 400 },
      );
    }

    // ---------------------------------------------------------
    // LỚP 2: AI CẤU TRÚC HÓA DỮ LIỆU (TRANSFORM)
    // ---------------------------------------------------------
    const promptContext = `
      Bạn là chuyên gia cấu trúc dữ liệu. Tôi có một đoạn văn bản thô được trích xuất từ đề thi TOEIC.
      Nhiệm vụ của bạn là đọc hiểu đoạn văn bản này, tìm ra các câu hỏi, các lựa chọn A,B,C,D và đáp án đúng.
      Ưu tiên đáp án có trong answer key. Nếu tài liệu không có answer key, chỉ suy luận khi có đủ dữ kiện ngữ pháp/ngữ nghĩa rõ ràng; người dùng sẽ kiểm duyệt trước khi lưu.
      Nếu đây là bài nghe, hãy gán link audio sau vào group: "${audioUrl || ""}".

      Văn bản thô:
      """
      ${rawText.substring(0, 30000)} // Giới hạn text để tránh quá tải token
      """
    `;

    // Gọi AI với responseSchema chặt chẽ, vì đây là tác vụ Admin nên ta cần độ chuẩn xác 100% của JSON
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: promptContext,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            data: {
              type: Type.ARRAY,
              description: "Danh sách các nhóm câu hỏi hoặc câu hỏi đơn lẻ",
              items: {
                type: Type.OBJECT,
                properties: {
                  group: {
                    type: Type.OBJECT,
                    nullable: true,
                    description:
                      "Đoạn văn chung hoặc Audio dùng cho nhiều câu hỏi. Để null nếu là câu hỏi ngữ pháp đơn lẻ Part 5.",
                    properties: {
                      groupType: {
                        type: Type.STRING,
                        description: "'TEXT' hoặc 'AUDIO'",
                      },
                      passageText: { type: Type.STRING, nullable: true },
                      audioUrl: { type: Type.STRING, nullable: true },
                    },
                  },
                  questions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        part: {
                          type: Type.INTEGER,
                          description: "Part của TOEIC (1-7)",
                        },
                        content: {
                          type: Type.STRING,
                          description: "Nội dung câu hỏi",
                        },
                        options: {
                          type: Type.OBJECT,
                          description:
                            "Ví dụ: {'A':'Từ 1', 'B':'Từ 2', 'C':'Từ 3', 'D':'Từ 4'}",
                        },
                        correctAnswer: {
                          type: Type.STRING,
                          description: "Chỉ một ký tự: 'A', 'B', 'C' hoặc 'D'",
                        },
                      },
                      required: ["part", "content", "options", "correctAnswer"],
                    },
                  },
                },
                required: ["questions"],
              },
            },
          },
        },
      },
    });

    const resultObj = JSON.parse(response.text || "{}");

    return NextResponse.json(
      {
        message: "Trích xuất thành công!",
        extractedData: resultObj,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Lỗi extract AI:", error);
    return NextResponse.json(
      { error: "Xảy ra lỗi trong quá trình xử lý." },
      { status: 500 },
    );
  }
}
