import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { IMPORT_STALE_MS } from "@/app/lib/ingestion-status";
import { importExtractedQuestions } from "@/app/lib/question-import";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return apiError("INVALID_JOB_ID", "Mã tác vụ không hợp lệ.", 400);

  const claimed = await prisma.ingestionJob.updateMany({
    where: {
      id: parsedId.data,
      ownerId: user.id,
      importedAt: null,
      OR: [
        { status: "COMPLETED" },
        { status: "IMPORTING", updatedAt: { lt: new Date(Date.now() - IMPORT_STALE_MS) } },
      ],
    },
    data: { status: "IMPORTING" },
  });
  if (claimed.count !== 1) {
    const existing = await prisma.ingestionJob.findFirst({
      where: { id: parsedId.data, ownerId: user.id },
      select: { status: true, importedAt: true },
    });
    if (existing?.status === "IMPORTED" && existing.importedAt) {
      return apiJson({ imported: true, alreadyImported: true });
    }
    return apiError("JOB_NOT_IMPORTABLE", "Tác vụ chưa sẵn sàng hoặc đang được lưu.", 409);
  }

  try {
    const job = await prisma.ingestionJob.findFirst({
      where: { id: parsedId.data, ownerId: user.id, status: "IMPORTING" },
      select: { result: true },
    });
    if (!job?.result) throw new Error("INGESTION_RESULT_MISSING");
    const importedAt = new Date();
    const questionsAdded = await importExtractedQuestions(
      user.id,
      job.result,
      async (tx) => {
        await tx.ingestionJob.update({
          where: { id: parsedId.data },
          data: { status: "IMPORTED", importedAt },
        });
      },
    );
    return apiJson({ imported: true, questionsAdded, importedAt: importedAt.toISOString() });
  } catch (error) {
    await prisma.ingestionJob.updateMany({
      where: { id: parsedId.data, ownerId: user.id, status: "IMPORTING" },
      data: { status: "COMPLETED" },
    });
    console.error("ingestion import failed", {
      jobId: parsedId.data,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return apiError("IMPORT_FAILED", "Không thể lưu câu hỏi; dữ liệu chưa bị nhân đôi.", 500);
  }
}
