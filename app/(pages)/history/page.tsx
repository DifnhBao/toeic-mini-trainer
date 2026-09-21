import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import AppHeader from "@/app/components/AppHeader";

export default async function HistoryPage() {
  const session = await auth();
  const attempts = session?.user?.email ? await prisma.testAttempt.findMany({
    where: { user: { email: session.user.email } },
    orderBy: { completedAt: "desc" },
    include: { test: true, userAnswers: { include: { question: true } } },
  }) : [];

  const totalQuestions = attempts.reduce((sum, attempt) => sum + attempt.userAnswers.length, 0);
  const totalCorrect = attempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0);
  const accuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  return (
    <div className="app-page">
      <AppHeader />
      <main className="page-shell history-page">
        <div className="history-title"><div><p className="eyebrow">NHẬT KÝ HỌC TẬP</p><h1>Lịch sử luyện tập</h1><p>Nhìn lại kết quả để chọn đúng nội dung cho phiên tiếp theo.</p></div><Link href="/" className="primary-button">+ Tạo bài mới</Link></div>

        <section className="history-summary">
          <div><span>TỔNG SỐ BÀI</span><strong>{attempts.length}</strong></div><div><span>CÂU ĐÃ LUYỆN</span><strong>{totalQuestions}</strong></div><div><span>ĐỘ CHÍNH XÁC</span><strong>{accuracy}%</strong></div>
        </section>

        {!session?.user ? (
          <div className="history-empty"><strong>Đăng nhập để xem lịch sử</strong><p>Kết quả được gắn với tài khoản Google của bạn.</p><Link href="/">Về trang chủ để đăng nhập</Link></div>
        ) : attempts.length === 0 ? (
          <div className="history-empty"><strong>Chưa có bài luyện nào</strong><p>Bắt đầu bằng một mini test 5 câu để tạo mốc đầu tiên.</p><Link href="/">Tạo bài luyện đầu tiên</Link></div>
        ) : (
          <section className="attempt-table" aria-label="Danh sách bài đã làm">
            <div className="attempt-table-head"><span>Bài luyện</span><span>Phạm vi</span><span>Kết quả</span><span>Thời gian</span><span /></div>
            {attempts.map((attempt) => {
              const total = attempt.userAnswers.length;
              const score = attempt.score ?? 0;
              const percent = total ? Math.round((score / total) * 100) : 0;
              const parts = Array.from(new Set(attempt.userAnswers.map((item) => item.question.part))).sort();
              return (
                <Link href={`/attempts/${attempt.id}`} key={attempt.id} className="attempt-row">
                  <div><span className="attempt-icon">✓</span><span><strong>{attempt.test.title}</strong><small>{attempt.completedAt.toLocaleDateString("vi-VN")}</small></span></div>
                  <span>{parts.map((part) => `Part ${part}`).join(", ")}</span>
                  <span className={`attempt-score ${percent >= 70 ? "good" : percent >= 50 ? "average" : "low"}`}><strong>{percent}%</strong><small>{score}/{total} câu</small></span>
                  <span>{attempt.completedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span>→</span>
                </Link>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
