import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { requestUser } from "@/app/lib/request-user";
import { consumeDailyAiCall } from "@/app/lib/ai-usage";
import { z } from "zod";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { takeRateLimit } from "@/app/lib/rate-limit";

const ai = new GoogleGenAI({});
export const maxDuration = 60;
const schema = z.object({
  message: z.string().trim().min(1).max(2000),
  part: z.string().trim().max(20).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const user = await requestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Vui lòng đăng nhập để dùng AI Coach." }, { status: 401 });
    }

    const limit = await takeRateLimit(request, `mobile-ai-coach:${user.id}`, 10, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "AI Coach tạm thời bận. Vui lòng thử lại sau." }, {
        status: limit.unavailable ? 503 : 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }
    const body = await parseBoundedJson(request, schema);
    if (!body.success) {
      const data = await body.response.json();
      return NextResponse.json({ error: data.error.message }, { status: body.response.status });
    }
    const { message } = body.data;
    const part = body.data.part || "Tổng hợp";

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
      config: { maxOutputTokens: 4_096, httpOptions: { timeout: 45_000 } },
    });

    const answer = response.text?.trim();
    if (!answer) throw new Error("AI returned an empty answer");
    return NextResponse.json({ answer });
  } catch (error) {
    console.error("AI Coach error", { errorType: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "AI Coach đang bận. Vui lòng thử lại sau ít phút." }, { status: 503 });
  }
}
