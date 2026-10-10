"use client";
import { useState } from "react";
import { apiFailureMessage } from '@/shared/response-diagnostics';

type Explanation = {
  explanationText: string;
  suggestedSkills: string[];
};

function normalizeSkills(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export default function AiExplainButton({
  userAnswerId,
  initialExplanation,
}: {
  userAnswerId: string;
  initialExplanation: { explanationText: string; suggestedSkills: unknown } | null;
}) {
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(
    initialExplanation
      ? {
          explanationText: initialExplanation.explanationText,
          suggestedSkills: normalizeSkills(initialExplanation.suggestedSkills),
        }
      : null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleExplain = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAnswerId }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 503 || res.status === 500) {
        setErrorMessage(
          apiFailureMessage(res, null, "AI đang bị quá tải hoặc bận đột xuất. Bạn chờ vài giây rồi thử lại nhé!"),
        );
      } else if (!res.ok || data?.error) {
        setErrorMessage(apiFailureMessage(res, data, "Không thể nhận lời giải. Vui lòng thử lại."));
      } else if (typeof data?.explanationText === "string") {
        setExplanation({
          explanationText: data.explanationText,
          suggestedSkills: normalizeSkills(data.suggestedSkills),
        });
      } else {
        setErrorMessage(apiFailureMessage(res, null, "Phản hồi AI không hợp lệ. Vui lòng thử lại."));
      }
    } catch {
      setErrorMessage("Lỗi kết nối mạng. Vui lòng kiểm tra lại Internet.");
    } finally {
      setLoading(false);
    }
  };

  // Nếu đã có lời giải (từ DB hoặc vừa fetch xong), hiển thị lời giải
  if (explanation) {
    return (
      <div className="mt-4 p-5 bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 mb-3 font-bold text-indigo-800">
          <span>✨ AI Phân tích lỗi sai:</span>
        </div>
        <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
          {explanation.explanationText}
        </p>

        {explanation.suggestedSkills &&
          explanation.suggestedSkills.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-gray-500 uppercase">
                Tag kỹ năng:
              </span>
              {explanation.suggestedSkills.map((tag: string, i: number) => (
                <span
                  key={i}
                  className="px-2.5 py-1 bg-white border border-indigo-200 text-indigo-700 text-xs font-medium rounded-full shadow-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
      </div>
    );
  }

  // Nếu chưa có lời giải, hiển thị nút bấm
  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      <button
        onClick={handleExplain}
        disabled={loading}
        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2"
      >
        {loading ? "Đang tư duy..." : "🪄 Giải thích đáp án này"}
      </button>

      {/* Hiển thị lỗi màu đỏ nhạt nếu AI báo bận */}
      {errorMessage && (
        <span className="text-sm text-red-500 font-medium">{errorMessage}</span>
      )}
    </div>
  );
}
