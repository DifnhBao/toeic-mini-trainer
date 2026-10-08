import { NextResponse } from "next/server";
import { z } from "zod";
import { POST as generatePractice } from "@/app/api/v1/tests/route";
import { parseBoundedJson } from "@/app/lib/mobile-api";

const schema = z.object({
  limit: z.number().int().min(5).max(50).default(10),
  part: z.enum(["mixed", "listening", "reading", "1", "2", "3", "4", "5", "6", "7"]).default("mixed"),
}).strict();

export async function POST(request: Request) {
  const body = await parseBoundedJson(request, schema);
  if (!body.success) {
    const error = await body.response.json();
    return NextResponse.json({ error: error.error.message }, { status: body.response.status });
  }
  const parts = body.data.part === "mixed" ? [1, 2, 3, 4, 5, 6, 7]
    : body.data.part === "listening" ? [1, 2, 3, 4]
    : body.data.part === "reading" ? [5, 6, 7] : [Number(body.data.part)];
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  const response = await generatePractice(new Request(request.url, {
    method: "POST", headers,
    body: JSON.stringify({ count: body.data.limit, parts }),
  }));
  const data = await response.json();
  return NextResponse.json(
    response.ok ? { testId: data.test.id } : { error: data.error.message },
    { status: response.status, headers: response.headers },
  );
}
