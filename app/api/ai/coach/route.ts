import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { requestUser } from "@/app/lib/request-user";
import { consumeDailyAiCall } from "@/app/lib/ai-usage";

const ai = new GoogleGenAI({});

export async function POST(request: Request) {
  try {
    const user = await requestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Vui lòng đăng nhập để dùng AI Coach." }, { status: 401 });
    }

    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const part = typeof body.part === "string" ? body.part.slice(0, 20) : "Tổng hợp";

    if (!message || message.length > 2000) {
      return NextResponse.json({ error: "Câu hỏi cần từ 1 đến 2.000 ký tự." }, { status: 400 });
    }

    if (!(await consumeDailyAiCall(user.id, "coach", 20))) {
      return NextResponse.json({ error: "Bạn đã dùng hết lượt hỏi AI hôm nay." }, { status: 429 });
    }

    const prompt = `
Bạn là giáo viên TOEIC người Việt, chắc kiến thức và hướng dẫn thực tế.
Người học đang tập trung vào: ${part}.
Câu hỏi: ${message}

Hãy trả lời bằng tiếng Việt, tối đa 350 từ. Đi thẳng vào điều người học cần hiểu.
- Nếu là ngữ pháp/từ vựng: giải thích quy tắc, chỉ ra dấu hiệu nhận biết và cho 1 ví dụ TOEIC ngắn.
- Nếu là chiến thuật: đưa quy trình 2-4 bước áp dụng ngay và một lỗi thường gặp.
- Nếu người học đưa câu hỏi trắc nghiệm: phân tích đáp án đúng và vì sao các đáp án nhiễu sai.
- Không bịa nội dung audio, transcript hoặc quy định TOEIC mà người học chưa cung cấp.
- Kết thúc bằng một dòng "Ghi nhớ:" thật ngắn.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const answer = response.text?.trim();
    if (!answer) throw new Error("AI returned an empty answer");
    return NextResponse.json({ answer });
  } catch (error) {
    console.error("AI Coach error:", error);
    return NextResponse.json({ error: "AI Coach đang bận. Vui lòng thử lại sau ít phút." }, { status: 503 });
  }
}
