import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { consumeDailyAiCall } from "@/app/lib/ai-usage";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { mobileUserFromRequest } from "@/app/lib/mobile-auth";
import { takeRateLimit } from "@/app/lib/rate-limit";

export const runtime = "nodejs";

const ai = new GoogleGenAI({});

const MAX_TURNS = 12;
const MAX_MESSAGE_CHARS = 2_000;

const coachSchema = z
  .object({
    part: z.string().trim().max(20).optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
        }),
      )
      .min(1)
      .max(MAX_TURNS),
  })
  .refine((body) => body.messages[body.messages.length - 1]?.role === "user", {
    message: "Tin nhắn cuối cùng phải là câu hỏi của người học.",
  });

const SYSTEM_PROMPT = `Bạn là giáo viên TOEIC người Việt, chắc kiến thức và hướng dẫn thực tế.
Trả lời bằng tiếng Việt, tối đa 350 từ. Đi thẳng vào điều người học cần hiểu.
- Nếu là ngữ pháp/từ vựng: giải thích quy tắc, chỉ ra dấu hiệu nhận biết và cho 1 ví dụ TOEIC ngắn.
- Nếu là chiến thuật: đưa quy trình 2-4 bước áp dụng ngay và một lỗi thường gặp.
- Nếu người học đưa câu hỏi trắc nghiệm: phân tích đáp án đúng và vì sao các đáp án nhiễu sai.
- Không bịa nội dung audio, transcript hoặc quy định TOEIC mà người học chưa cung cấp.
- Kết thúc bằng một dòng "Ghi nhớ:" thật ngắn.`;

export async function POST(request: Request) {
  const user = await mobileUserFromRequest(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const limit = takeRateLimit(request, `mobile-ai-coach:${user.id}`, 10, 60_000);
  if (!limit.allowed) {
    return apiError("RATE_LIMITED", "Bạn đang hỏi quá nhanh. Vui lòng thử lại sau.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const body = await parseBoundedJson(request, coachSchema);
  if (!body.success) return body.response;

  const focus = body.data.part?.trim() || "Tổng hợp";

  if (!(await consumeDailyAiCall(user.id, "coach", 20))) {
    return apiError("AI_DAILY_LIMIT", "Bạn đã dùng hết lượt hỏi AI hôm nay.", 429);
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: body.data.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      config: {
        systemInstruction: `${SYSTEM_PROMPT}\nNgười học đang tập trung vào: ${focus}.`,
      },
    });

    const answer = response.text?.trim();
    if (!answer) throw new Error("AI returned an empty answer");
    return apiJson({ answer });
  } catch (error) {
    console.error("v1 AI coach error:", error);
    return apiError("AI_UNAVAILABLE", "AI Coach đang bận. Vui lòng thử lại sau ít phút.", 503);
  }
}
