import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { mobileUserFromRequest } from "@/app/lib/mobile-auth";
import { prisma } from "@/app/lib/prisma";
import { takeRateLimit } from "@/app/lib/rate-limit";

export const runtime = "nodejs";

const ai = new GoogleGenAI({});

const explainSchema = z.object({
  userAnswerId: z.string().uuid("Mã câu trả lời không hợp lệ."),
});

export async function POST(request: Request) {
  const user = await mobileUserFromRequest(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const limit = takeRateLimit(request, `mobile-ai-explain:${user.id}`, 30, 60_000);
  if (!limit.allowed) {
    return apiError("RATE_LIMITED", "Bạn đang yêu cầu quá nhanh. Vui lòng thử lại sau.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const body = await parseBoundedJson(request, explainSchema);
  if (!body.success) return body.response;
  const { userAnswerId } = body.data;

  // Check ownership before reading even a cached explanation.
  const ua = await prisma.userAnswer.findFirst({
    where: { id: userAnswerId, attempt: { userId: user.id } },
    include: { question: { include: { group: true } }, aiExplanation: true },
  });
  if (!ua) {
    return apiError("ANSWER_NOT_FOUND", "Không tìm thấy câu trả lời trong kết quả của bạn.", 404);
  }
  if (ua.isCorrect) {
    return apiError("ALREADY_CORRECT", "Câu này đã đúng nên không cần chữa lỗi.", 422);
  }
  if (ua.aiExplanation) {
    return apiJson({
      explanation: {
        explanationText: ua.aiExplanation.explanationText,
        suggestedSkills: ua.aiExplanation.suggestedSkills,
        cached: true,
      },
    });
  }

  const q = ua.question;
  const options = q.options as Record<string, string>;

  const prompt = `
    Bạn là giám khảo chấm thi TOEIC khó tính và súc tích. Hãy giải thích câu hỏi sau.
    Ngữ cảnh: ${q.group?.passageText || "Không có"}
    Câu hỏi: ${q.content || "Điền vào chỗ trống"}
    Các lựa chọn: A. ${options["A"]} | B. ${options["B"]} | C. ${options["C"]} | D. ${options["D"]}
    Người dùng đã chọn: ${ua.selectedOption || "Bỏ trống"} (SAI). Đáp án ĐÚNG là: ${q.correctAnswer}.

    QUAN TRỌNG:
    1. KHÔNG chào hỏi, KHÔNG dài dòng. Đi thẳng vào vấn đề. Tối đa 80 chữ.
    2. Trả về DUY NHẤT một Object JSON hợp lệ (không bọc markdown \`\`\`json).
    3. Trường "explanationText" BẮT BUỘC phải trình bày theo đúng định dạng 3 dòng sau (dùng \\n để xuống dòng):

    ✅ ĐÁP ÁN ĐÚNG (${q.correctAnswer}): [Giải thích ngắn gọn 1 câu vì sao đúng].
    ❌ VÌ SAO BẠN SAI (${ua.selectedOption}): [Chỉ ra trực diện lỗi sai về ngữ pháp/ngữ nghĩa].
    💡 MẸO GHI NHỚ: [1 câu tóm tắt quy tắc cần nhớ].

    Cấu trúc JSON mong muốn:
    {
      "explanationText": "✅ ĐÁP ÁN ĐÚNG (A): ...\\n\\n❌ VÌ SAO BẠN SAI (C): ...\\n\\n💡 MẸO GHI NHỚ: ...",
      "suggestedSkills": ["Từ khóa 1", "Từ khóa 2"]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            explanationText: { type: Type.STRING },
            suggestedSkills: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["explanationText", "suggestedSkills"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}") as {
      explanationText?: string;
      suggestedSkills?: unknown;
    };
    if (!parsed.explanationText) throw new Error("AI returned an invalid explanation");

    // 3. Lưu lại để những lần xem sau không tốn thêm lượt gọi AI.
    const saved = await prisma.aiExplanation.create({
      data: {
        userAnswerId: ua.id,
        explanationText: parsed.explanationText,
        suggestedSkills: Array.isArray(parsed.suggestedSkills) ? parsed.suggestedSkills : undefined,
      },
    });

    return apiJson({
      explanation: {
        explanationText: saved.explanationText,
        suggestedSkills: saved.suggestedSkills,
        cached: false,
      },
    });
  } catch (error) {
    console.error("v1 AI explain error:", error);
    return apiError("AI_UNAVAILABLE", "AI đang bận. Vui lòng thử lại sau ít phút.", 503);
  }
}
