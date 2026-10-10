import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { hasRole } from "@/app/lib/authorization";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";
import { equalTagIds, skillTagUpdateSchema, skillTaxonomy, tagsForPart } from "@/app/lib/skill-taxonomy";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requestUser(request);
  if (!actor) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(actor, "ADMIN")) return apiError("FORBIDDEN", "Chỉ quản trị viên được gắn nhãn kỹ năng.", 403);
  if (!request.headers.has("authorization") && request.headers.get("origin") !== new URL(request.url).origin)
    return apiError("INVALID_ORIGIN", "Hãy thực hiện từ trang quản trị của ứng dụng.", 403);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return apiError("INVALID_QUESTION_ID", "Mã câu hỏi không hợp lệ.", 400);
  const body = await parseBoundedJson(request, skillTagUpdateSchema);
  if (!body.success) return body.response;
  const selected = skillTaxonomy.filter(tag => body.data.keys.includes(tag.key));
  const result = await prisma.$transaction(async tx => {
    // Serialize this editor and reject a stale tab instead of losing its update.
    const rows = await tx.$queryRaw<Array<{ id: string; part: number }>>`
      SELECT id, part FROM questions WHERE id = ${id.data} AND "ownerId" IS NULL
      AND "publicationStatus" IN ('LEGACY', 'PUBLISHED', 'ARCHIVED') FOR UPDATE`;
    if (!rows.length) return { error: "missing" as const };
    const available = tagsForPart(rows[0].part);
    if (selected.some(tag => !available.some(item => item.key === tag.key))) return { error: "part" as const };
    const current = await tx.questionSkillTag.findMany({ where: { questionId: id.data }, select: { skillTag: { select: { id: true, name: true } } } });
    if (!equalTagIds(current.map(item => item.skillTag.id), body.data.expectedTagIds)) return { error: "stale" as const };
    const controlled = current.filter(item => skillTaxonomy.some(tag => tag.name === item.skillTag.name));
    const changed = controlled.length !== selected.length || controlled.some(item => !selected.some(tag => tag.name === item.skillTag.name));
    if (changed) {
      // Unknown legacy tags are visible in the editor and deliberately preserved.
      await tx.questionSkillTag.deleteMany({ where: { questionId: id.data, skillTagId: { in: controlled.map(item => item.skillTag.id) } } });
      for (const tag of selected) {
        const stored = await tx.skillTag.upsert({ where: { name: tag.name }, create: { name: tag.name, description: tag.guide }, update: { name: tag.name }, select: { id: true } });
        await tx.questionSkillTag.create({ data: { questionId: id.data, skillTagId: stored.id } });
      }
      const previousNames = controlled.map(item => item.skillTag.name).sort().join(", ") || "Chưa gắn";
      const nextNames = selected.map(tag => tag.name).sort().join(", ") || "Chưa gắn";
      await tx.authorizationAuditEvent.create({ data: { actorId: actor.id, action: "QUESTION_SKILL_TAGS_UPDATED", targetType: "Question", targetId: id.data,
        reason: `${body.data.reason}\nNhãn chuẩn: ${previousNames} → ${nextNames}` } });
    }
    const tags = await tx.questionSkillTag.findMany({ where: { questionId: id.data }, select: { skillTag: { select: { id: true, name: true } } } });
    return { changed, tags: tags.map(item => item.skillTag) };
  });
  if ("error" in result) {
    if (result.error === "missing") return apiError("QUESTION_NOT_ELIGIBLE", "Chỉ gắn nhãn cho câu trong kho chung.", 404);
    if (result.error === "part") return apiError("SKILL_PART_MISMATCH", "Nhãn không phù hợp với Part của câu hỏi.", 422);
    return apiError("SKILL_TAGS_CHANGED", "Nhãn đã được cập nhật ở nơi khác. Tải lại câu trước khi sửa.", 409);
  }
  return apiJson(result);
}
