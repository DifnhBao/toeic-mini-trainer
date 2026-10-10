import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { sharedQuestionDataSchema } from "@/app/lib/content-contributions";
import IngestionQuestionReview from "@/app/components/IngestionQuestionReview";
import AdminShell from "../../../_components/AdminShell";
import { AdminAccessDenied, adminUser } from "../../../_components/admin-access";

export const runtime = "nodejs";

export default async function EditRejectedContribution({ params }: { params: Promise<{ id: string }> }) {
  const admin = await adminUser();
  if (!admin) return <AdminAccessDenied />;
  const parsedId = z.string().uuid().safeParse((await params).id);
  if (!parsedId.success) notFound();
  const contribution = await prisma.contentContribution.findFirst({
    where: { id: parsedId.data, ownerId: admin.id, status: "REJECTED" },
    select: { id: true, data: true, reviewNote: true, updatedAt: true,
      sourceJob: { select: { id: true, pageStart: true, pageEnd: true } } },
  });
  if (!contribution) notFound();
  const parsed = sharedQuestionDataSchema.safeParse(contribution.data);
  return <AdminShell title="Sửa và gửi lại bộ câu hỏi" description="Sửa bản đã gửi trước đó, kiểm tra lại từng câu và xác nhận quyền chia sẻ. Không cần phân tích AI lại.">
    <Link href="/admin/contributions?status=REJECTED" className="font-semibold text-blue-700 underline">← Nội dung bị từ chối</Link>
    <p className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Lý do từ chối: {contribution.reviewNote || "Không có ghi chú"}</p>
    <p className="mb-4 text-sm text-slate-600">Bản sửa dùng lại audio và ảnh đã gắn. Sau khi gửi, nội dung trở về chờ duyệt; chưa được công khai.</p>
    {parsed.success ? <IngestionQuestionReview key={`${contribution.id}:${contribution.updatedAt.toISOString()}`}
      groups={parsed.data.data} jobId={contribution.sourceJob.id} forSharedLibrary
      pageRange={{ start: contribution.sourceJob.pageStart, end: contribution.sourceJob.pageEnd ?? contribution.sourceJob.pageStart }}
      resubmission={{ contributionId: contribution.id, expectedUpdatedAt: contribution.updatedAt.toISOString() }}
    /> : <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">Bản đã gửi có dữ liệu không hợp lệ. Cần kiểm tra tác vụ nguồn trước khi sửa.</p>}
  </AdminShell>;
}
