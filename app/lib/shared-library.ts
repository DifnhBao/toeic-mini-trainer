import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import type { LibraryCatalogue } from "@/types/library";

const published: Prisma.QuestionWhereInput = { ownerId: null, publicationStatus: "PUBLISHED" };
// Shared media is copied and verified by contribution approval. Never expose
// private groups or source filenames/PDFs in the learner catalogue.
const shared: Prisma.QuestionGroupWhereInput = {
  ownerId: null, contribution: { is: { status: "APPROVED" } }, questions: { some: published },
};
const selection = {
  id: true, createdAt: true, passageText: true,
  audioAsset: { select: { ownerId: true, status: true, kind: true } },
  imageAsset: { select: { ownerId: true, status: true, kind: true } },
  questions: { where: published, take: 51, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, part: true } },
} satisfies Prisma.QuestionGroupSelect;
type SelectedGroup = Prisma.QuestionGroupGetPayload<{ select: typeof selection }>;
function lessonState(group: SelectedGroup) {
  const hasAudio = group.audioAsset?.status === "READY" && group.audioAsset.kind === "AUDIO" && group.audioAsset.ownerId === null;
  const hasImage = group.imageAsset?.status === "READY" && group.imageAsset.kind === "IMAGE" && group.imageAsset.ownerId === null;
  const parts = [...new Set(group.questions.map((question) => question.part))].sort();
  const unavailableReason = group.questions.length === 0 ? "Bài chưa có câu hỏi"
    : group.questions.length > 50 ? "Cần chia thành bài tối đa 50 câu"
    : parts.some((part) => part <= 4) && !hasAudio ? "Đang chuẩn bị audio"
    : parts.includes(1) && !hasImage ? "Đang chuẩn bị hình ảnh"
    : parts.some((part) => part >= 6) && !group.passageText?.trim() ? "Đang chuẩn bị đoạn đọc" : null;
  return { parts, hasAudio, hasImage, playable: unavailableReason === null, unavailableReason };
}

export async function sharedLibrary(cursor?: string): Promise<LibraryCatalogue> {
  const rows = await prisma.questionGroup.findMany({
    where: shared, select: selection, take: 21,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  return {
    lessons: rows.slice(0, 20).map((row) => ({
      id: row.id, title: lessonState(row).hasAudio ? "Luyện nghe" : "Luyện đọc",
      questionCount: row.questions.length, ...lessonState(row), createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > 20 ? rows[19].id : null,
  };
}

export async function createSharedLibraryTest(userId: string, groupId: string) {
  return prisma.$transaction(async (tx) => {
    const group = await tx.questionGroup.findFirst({ where: { ...shared, id: groupId }, select: selection });
    if (!group || !lessonState(group).playable) return null;
    return tx.miniTest.create({
      data: {
        createdById: userId,
        title: `Kho bài · Part ${[...new Set(group.questions.map((question) => question.part))].sort().join(", ")} · ${group.questions.length} câu`,
        questions: { create: group.questions.map((question, index) => ({ questionId: question.id, orderIndex: index + 1 })) },
      },
      select: { id: true, title: true },
    });
  });
}
