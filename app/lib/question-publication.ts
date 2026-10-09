import type { Prisma } from "@prisma/client";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";

export const publicationCandidateSelect = {
  part: true, content: true, options: true, correctAnswer: true,
  contentRevision: true, publicationStatus: true, groupId: true,
  group: { select: {
    ownerId: true, passageText: true,
    audioAssetId: true, imageAssetId: true, audioUrl: true, imageUrl: true,
    contribution: { select: { status: true } },
    audioAsset: { select: { ownerId: true, kind: true, status: true } },
    imageAsset: { select: { ownerId: true, kind: true, status: true } },
  } },
} satisfies Prisma.QuestionSelect;

export type PublicationCandidate = Prisma.QuestionGetPayload<{ select: typeof publicationCandidateSelect }>;

const contentSchema = z.object({
  part: z.number().int().min(1).max(7),
  content: z.string().max(10_000).nullable(),
  options: z.record(z.string().regex(/^[A-D]$/), z.string().trim().min(1).max(4_000))
    .refine(options => Object.keys(options).length >= 2 && Object.keys(options).length <= 4),
  correctAnswer: z.string().regex(/^[A-D]$/),
}).refine(question => Object.hasOwn(question.options, question.correctAnswer))
  .refine(question => question.part <= 2 || Boolean(question.content?.trim()));

export function questionPublicationIssue(question: PublicationCandidate) {
  if (!contentSchema.safeParse(question).success) {
    return { code: "INVALID_CONTENT", message: "Câu hỏi thiếu nội dung, lựa chọn hoặc đáp án hợp lệ. Hãy sửa và kiểm tra lại trước khi xuất bản.", status: 422 };
  }
  const group = question.group;
  const hasMedia = Boolean(group?.audioAssetId || group?.imageAssetId || group?.audioUrl || group?.imageUrl);
  if (group?.ownerId || (hasMedia && (group?.contribution?.status !== "APPROVED" || group.audioUrl || group.imageUrl))) {
    return { code: "MEDIA_REVIEW_REQUIRED", message: "Nhóm câu hoặc media chưa thuộc kho chia sẻ đã duyệt.", status: 409 };
  }
  const ready = (asset: NonNullable<PublicationCandidate["group"]>["audioAsset"], kind: "AUDIO" | "IMAGE") =>
    asset?.ownerId === null && asset.status === "READY" && asset.kind === kind;
  if ((group?.audioAssetId && !ready(group.audioAsset, "AUDIO")) ||
      (group?.imageAssetId && !ready(group.imageAsset, "IMAGE"))) {
    return { code: "MEDIA_UNAVAILABLE", message: "Media chia sẻ không còn sẵn sàng hoặc có loại/quyền sở hữu không hợp lệ.", status: 409 };
  }
  if ((question.part <= 4 && !group?.audioAssetId) || (question.part === 1 && !group?.imageAssetId)) {
    return { code: "MEDIA_REQUIRED", message: "Bài nghe cần audio; Part 1 cần thêm ảnh trước khi công khai.", status: 422 };
  }
  if (question.part >= 6 && !sanitizeHtml(group?.passageText || "", { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, " ").trim()) {
    return { code: "PASSAGE_REQUIRED", message: "Part 6 và 7 cần đoạn đọc có nội dung trước khi công khai.", status: 422 };
  }
  return null;
}
