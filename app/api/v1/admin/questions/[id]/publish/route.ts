import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { hasRole } from "@/app/lib/authorization";
import { parseBoundedJson } from "@/app/lib/mobile-api";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";
import { publicationCandidateSelect, questionPublicationIssue } from "@/app/lib/question-publication";

export const runtime = "nodejs";
const bodySchema = z.object({ reason: z.string().trim().min(5).max(500) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requestUser(request);
  if (!actor) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);
  if (!hasRole(actor, "ADMIN")) return apiError("FORBIDDEN", "Chỉ admin được xuất bản câu hỏi.", 403);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return apiError("INVALID_QUESTION_ID", "Mã câu hỏi không hợp lệ.", 400);
  const body = await parseBoundedJson(request, bodySchema);
  if (!body.success) return body.response;

  const changed = await prisma.$transaction(async (tx) => {
    const candidate = await tx.question.findFirst({
      where: { id: id.data, ownerId: null, publicationStatus: { in: ["LEGACY", "ARCHIVED"] } },
      select: publicationCandidateSelect,
    });
    if (!candidate) return { count: 0, issue: null };
    const issue = questionPublicationIssue(candidate);
    if (issue) return { count: 0, issue };
    const result = await tx.question.updateMany({
      where: { id: id.data, ownerId: null, publicationStatus: candidate.publicationStatus,
        contentRevision: candidate.contentRevision, groupId: candidate.groupId },
      data: { publicationStatus: "PUBLISHED" },
    });
    if (result.count === 1) {
      await tx.authorizationAuditEvent.create({
        data: { actorId: actor.id, action: "PUBLIC_QUESTION_PUBLISHED", targetType: "Question", targetId: id.data, reason: body.data.reason },
      });
    }
    return { ...result, issue: null };
  });
  if (changed.issue) return apiError(changed.issue.code, changed.issue.message, changed.issue.status);
  if (changed.count !== 1) return apiError("QUESTION_NOT_ELIGIBLE", "Câu hỏi không thể xuất bản.", 404);
  return apiJson({ published: true });
}
