import { z } from "zod";
import { apiError, apiJson } from "@/app/lib/api-response";
import { isStalledImport } from "@/app/lib/ingestion-status";
import { prisma } from "@/app/lib/prisma";
import { requestUser } from "@/app/lib/request-user";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requestUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Bạn cần đăng nhập lại.", 401);

  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return apiError("INVALID_JOB_ID", "Mã tác vụ không hợp lệ.", 400);

  let job = await prisma.ingestionJob.findFirst({
    where: { id: parsedId.data, ownerId: user.id },
    select: {
      id: true,
      status: true,
      attemptCount: true,
      errorCode: true,
      result: true,
      importedAt: true,
      contribution: { select: { id: true, status: true } },
      createdAt: true,
      completedAt: true,
      startedAt: true,
      updatedAt: true,
    },
  });
  if (!job) return apiError("JOB_NOT_FOUND", "Không tìm thấy tác vụ nhập đề.", 404);

  const now = Date.now();
  const processingTimedOut =
    job.status === "PROCESSING" &&
    job.startedAt &&
    job.startedAt.getTime() < now - 6 * 60_000;
  if (processingTimedOut) {
    await prisma.ingestionJob.updateMany({
      where: { id: job.id, ownerId: user.id, status: job.status, startedAt: job.startedAt, attemptCount: job.attemptCount },
      data: { status: "FAILED", errorCode: "WORKER_TIMEOUT", completedAt: new Date() },
    });
    job = await prisma.ingestionJob.findFirstOrThrow({
      where: { id: job.id, ownerId: user.id },
      select: {
        id: true,
        status: true,
        attemptCount: true,
        errorCode: true,
        result: true,
        importedAt: true,
        contribution: { select: { id: true, status: true } },
        createdAt: true,
        completedAt: true,
        startedAt: true,
        updatedAt: true,
      },
    });
  }

  const canReadResult = ["COMPLETED", "IMPORTING", "IMPORTED"].includes(job.status);
  return apiJson({
    job: {
      ...job,
      reviewProtocol: 1,
      importStalled: isStalledImport(job, now),
      result: canReadResult ? job.result : null,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() || null,
      importedAt: job.importedAt?.toISOString() || null,
    },
  });
}
