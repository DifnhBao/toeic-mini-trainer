import { apiJson } from "@/app/lib/api-response";
import { currentWebUser } from "@/app/lib/request-user";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentWebUser();
  return apiJson({ isAdmin: user?.role === "ADMIN" });
}
