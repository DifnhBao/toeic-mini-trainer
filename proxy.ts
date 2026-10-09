import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_ID_HEADER } from "./app/lib/request-trace";

// No session lookup, DB, provider call or body read. Never trust a caller's ID.
export function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = { matcher: "/api/:path*" };
