import { NextResponse } from "next/server";

const BASE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export function apiJson<T>(body: T, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  for (const [name, value] of Object.entries(BASE_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export function apiError(
  code: string,
  message: string,
  status: number,
  headers?: HeadersInit,
) {
  return apiJson(
    { error: { code, message } },
    { status, headers },
  );
}
