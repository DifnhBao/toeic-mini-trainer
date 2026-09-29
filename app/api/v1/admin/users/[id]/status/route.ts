import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { hasRole } from "@/app/lib/authorization";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";

export const runtime = "nodejs";
const bodySchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().min(5).max(500) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requestUser(request);
  if (!actor) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(actor, "ADMIN")) return apiError("FORBIDDEN", "Chỉ admin được quản lý tài khoản.", 403);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return apiError("INVALID_USER_ID", "Mã người dùng không hợp lệ.", 400);
  const body = await parseBoundedJson(request, bodySchema);
  if (!body.success) return body.response;
  if (id.data === actor.id) return apiError("SELF_STATUS_CHANGE", "Không thể tự khóa tài khoản.", 403);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: id.data }, select: { role: true, status: true } });
      if (!target) return null;
      if (target.role === "ADMIN" && body.data.status === "SUSPENDED") {
        const activeAdmins = await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
        if (activeAdmins <= 1) throw new Error("LAST_ADMIN");
      }
      if (target.status !== body.data.status) {
        await tx.user.update({ where: { id: id.data }, data: { status: body.data.status } });
        if (body.data.status === "SUSPENDED") {
          await tx.mobileSession.updateMany({ where: { userId: id.data, revokedAt: null }, data: { revokedAt: new Date() } });
        }
        await tx.authorizationAuditEvent.create({
          data: {
            actorId: actor.id, action: "USER_STATUS_CHANGED", targetType: "User", targetId: id.data,
            reason: `${target.status} -> ${body.data.status}: ${body.data.reason}`,
          },
        });
      }
      return { role: target.role, status: body.data.status };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!result) return apiError("USER_NOT_FOUND", "Không tìm thấy người dùng.", 404);
    return apiJson({ user: result });
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_ADMIN") return apiError("LAST_ADMIN", "Không thể khóa admin cuối cùng.", 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return apiError("CONFLICT", "Có thay đổi đồng thời. Hãy thử lại.", 409);
    return apiError("STATUS_CHANGE_FAILED", "Không thể đổi trạng thái tài khoản.", 503);
  }
}
