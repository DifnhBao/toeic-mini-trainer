import { NextResponse } from "next/server";
import { GET as getSummary } from "@/app/api/v1/progress/route";

export async function GET(request: Request) {
  const response = await getSummary(request);
  const data = await response.json();
  return NextResponse.json(response.ok ? data : { error: data.error.message }, {
    status: response.status, headers: response.headers,
  });
}
