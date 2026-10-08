import { NextResponse } from "next/server";
import { POST as submitAttempt } from "@/app/api/v1/tests/[id]/submit/route";

export const runtime = "nodejs";

// Keep the web response shape while sharing validation and idempotency.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const response = await submitAttempt(request, context);
  const body = await response.json();
  return NextResponse.json(
    response.ok ? body : { error: body.error?.message || "Không thể nộp bài." },
    { status: response.status, headers: response.headers },
  );
}
