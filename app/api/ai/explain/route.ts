import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { GoogleGenAI, Type } from "@google/genai";
import { auth } from "@/auth";

// Khởi tạo client. Nó sẽ tự động đọc key từ process.env.GEMINI_API_KEY
// Lưu ý: Đổi tên biến trong file .env của bạn từ GOOGLE_GENERATIVE_AI_API_KEY thành GEMINI_API_KEY
const ai = new GoogleGenAI({});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Vui lòng đăng nhập để dùng AI Coach." }, { status: 401 });
    }

    const { userAnswerId } = await request.json();

    // 1. Kiểm tra xem câu này đã từng được AI giải thích chưa (Caching)
    const existingExplanation = await prisma.aiExplanation.findUnique({
      where: { userAnswerId },
    });
    if (existingExplanation) {
      return NextResponse.json(existingExplanation, { status: 200 });
    }

    // 2. Lấy dữ liệu câu hỏi và đáp án của user
    const ua = await prisma.userAnswer.findFirst({
      where: { id: userAnswerId, attempt: { user: { email: session.user.email } } },
      include: {
        question: { include: { group: true } },
      },
    });

    if (!ua || ua.isCorrect) {
      return NextResponse.json(
        { error: "Không tìm thấy hoặc câu này đã đúng" },
        { status: 400 },
      );
    }

    const q = ua.question;
    const options = q.options as Record<string, string>;

    // 3. Build Prompt (Ngữ cảnh) cho AI
    const promptContext = `
      Bạn là giám khảo chấm thi TOEIC khó tính và súc tích. Hãy giải thích câu hỏi sau.
      Ngữ cảnh: ${q.group?.passageText || "Không có"}
      Câu hỏi: ${q.content || "Điền vào chỗ trống"}
      Các lựa chọn: A. ${options["A"]} | B. ${options["B"]} | C. ${options["C"]} | D. ${options["D"]}
      Người dùng đã chọn: ${ua.selectedOption || "Bỏ trống"} (SAI). Đáp án ĐÚNG là: ${q.correctAnswer}.

      QUAN TRỌNG: 
      1. KHÔNG chào hỏi, KHÔNG dài dòng. Đi thẳng vào vấn đề. Tối đa 80 chữ.
      2. Trả về DUY NHẤT một Object JSON hợp lệ (không bọc markdown \`\`\`json).
      3. Trường "explanationText" BẮT BUỘC phải trình bày theo đúng định dạng 3 dòng sau (dùng \n để xuống dòng):
      
      ✅ ĐÁP ÁN ĐÚNG (${q.correctAnswer}): [Giải thích ngắn gọn 1 câu vì sao đúng].
      ❌ VÌ SAO BẠN SAI (${ua.selectedOption}): [Chỉ ra trực diện lỗi sai về ngữ pháp/ngữ nghĩa].
      💡 MẸO GHI NHỚ: [1 câu tóm tắt quy tắc cần nhớ].

      Cấu trúc JSON JSON mong muốn:
      {
        "explanationText": "✅ ĐÁP ÁN ĐÚNG (A): ...\\n\\n❌ VÌ SAO BẠN SAI (C): ...\\n\\n💡 MẸO GHI NHỚ: ...",
        "suggestedSkills": ["Từ khóa 1", "Từ khóa 2"]
      }
    `;

    // 4. Gọi Gemini AI với Vercel AI SDK
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: promptContext,
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

    // Parse kết quả trả về từ dạng text JSON sang Object
    const resultObj = JSON.parse(response.text || "{}");

    // 5. Lưu vào Database để lần sau không phải tốn API gọi lại
    const savedExplanation = await prisma.aiExplanation.create({
      data: {
        userAnswerId: ua.id,
        explanationText: resultObj.explanationText,
        suggestedSkills: resultObj.suggestedSkills,
      },
    });

    return NextResponse.json(savedExplanation, { status: 200 });
  } catch (error) {
    console.error("Lỗi gọi AI:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
