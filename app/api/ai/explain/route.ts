import { NextResponse } from "next/server";
import { POST as explainWithSharedCache } from "@/app/api/v1/ai/explain/route";
export const maxDuration = 60;

// Legacy web response shape; authorization and shared cache live in one place.
export async function POST(request: Request) {
  const response = await explainWithSharedCache(request);
  const payload = await response.json();
  if (!response.ok) {
    const retryAfter = response.headers.get("Retry-After");
    return NextResponse.json({ error: payload.error?.message || "Không thể tạo lời giải." }, {
      status: response.status,
      ...(retryAfter ? { headers: { "Retry-After": retryAfter } } : {}),
    });
  }
  return NextResponse.json({
    explanationText: payload.explanation.explanationText,
    suggestedSkills: payload.explanation.suggestedSkills,
  });
}
