import Link from "next/link";
import { currentWebUser } from "@/app/lib/request-user";
import { prisma } from "@/app/lib/prisma";
import AppHeader from "@/app/components/AppHeader";
import AiExplainButton from "@/app/components/AiExplainButton";
import SafePassage from "@/app/components/SafePassage";
import { resolveQuestionGroupMedia } from "@/app/lib/object-storage";
import { currentExplanationHidden, hiddenExplanationSelection } from "@/app/lib/explanation-policy";
import { orderAttemptAnswers } from "@/app/lib/attempt-answer-order";

export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const user = await currentWebUser();

  const rawAttempt = user ? await prisma.testAttempt.findFirst({
    where: { id: attemptId, userId: user.id },
    include: {
      test: { select: {
        id: true, title: true,
        questions: { select: { questionId: true, orderIndex: true } },
      } },
      userAnswers: {
        include: {
          question: {
            include: {
              group: { include: { audioAsset: true, imageAsset: true, contribution: { select: { status: true } } } },
              explanationCaches: hiddenExplanationSelection,
            },
          },
          aiExplanation: true,
        },
        orderBy: { id: "asc" },
      },
    },
  }) : null;

  const attempt = rawAttempt
    ? {
        ...rawAttempt,
        userAnswers: await Promise.all(
          orderAttemptAnswers(rawAttempt.userAnswers, rawAttempt.test.questions).map(async (answer) => {
            const { explanationCaches, ...question } = answer.question;
            const explanationHidden = currentExplanationHidden(question.contentRevision, explanationCaches);
            return {
              ...answer,
              explanationHidden,
              aiExplanation: explanationHidden ? null : answer.aiExplanation,
              question: { ...question, group: await resolveQuestionGroupMedia(question.group, rawAttempt.userId) },
            };
          }),
        ),
      }
    : null;

  if (!attempt) {
    return <div className="app-page"><AppHeader /><main className="test-state"><strong>Không tìm thấy kết quả</strong><p>Hãy đăng nhập đúng tài khoản đã làm bài này.</p><Link href="/">Về trang chủ</Link></main></div>;
  }

  const total = attempt.userAnswers.length;
  const score = attempt.score ?? 0;
  const percentage = total ? Math.round((score / total) * 100) : 0;
  const incorrect = total - score;
  const parts = Array.from(new Set(attempt.userAnswers.map((item) => item.question.part))).sort();
  const message = percentage >= 80 ? "Nền tảng rất tốt" : percentage >= 60 ? "Đang tiến bộ đúng hướng" : "Đã tìm được phần cần ôn lại";

  return (
    <div className="app-page">
      <AppHeader />
      <main className="page-shell result-page">
        <section className="result-hero">
          <div className="result-copy"><span className="step-kicker">KẾT QUẢ BÀI LUYỆN</span><h1>{message}</h1><p>{attempt.test.title}</p><div className="result-actions"><Link href="/">Làm bài khác</Link><Link href="/history">Xem lịch sử</Link></div></div>
          <div className="score-disc"><strong>{percentage}%</strong><span>{score}/{total} câu đúng</span></div>
          <div className="result-breakdown"><div><strong>{score}</strong><span>Đúng</span></div><div><strong>{incorrect}</strong><span>Cần xem lại</span></div><div><strong>{parts.map((part) => `P${part}`).join(", ")}</strong><span>Phần đã luyện</span></div></div>
        </section>

        <div className="review-heading"><div><span className="step-kicker">CHỮA BÀI</span><h2>Xem lại từng câu</h2></div><p>AI Coach chỉ xuất hiện ở câu sai để bạn hiểu đúng lỗi của mình.</p></div>
        <section className="review-list">
          {attempt.userAnswers.map((userAnswer, index) => {
            const question = userAnswer.question;
            const options = question.options as Record<string, string>;
            return (
              <article className={`review-card ${userAnswer.isCorrect ? "is-correct" : "is-wrong"}`} key={userAnswer.id}>
                <div className="review-card-head"><div><span className="review-number">{index + 1}</span><strong>Part {question.part}</strong></div><span className="answer-status">{userAnswer.isCorrect ? "✓ Chính xác" : "✕ Cần xem lại"}</span></div>
                {question.group?.audioUrl && <audio className="review-audio" controls preload="metadata" src={question.group.audioUrl} />}
                {question.group?.imageUrl && <img className="question-image" src={question.group.imageUrl} alt={`Hình cho câu ${index + 1}`} />}
                {question.group?.passageText && <SafePassage html={question.group.passageText} className="passage compact-passage" />}
                <h3>{question.content || "Chọn đáp án đúng nhất."}</h3>
                <div className="review-options">
                  {Object.entries(options).map(([key, value]) => {
                    const correct = key === question.correctAnswer;
                    const selectedWrong = key === userAnswer.selectedOption && !userAnswer.isCorrect;
                    return <div key={key} className={correct ? "correct-option" : selectedWrong ? "wrong-option" : ""}><span>{key}</span><p>{value}</p>{correct && <small>Đáp án đúng</small>}{selectedWrong && <small>Bạn đã chọn</small>}</div>;
                  })}
                </div>
                {!userAnswer.selectedOption && <p className="unanswered-note">Bạn đã bỏ trống câu này.</p>}
                {!userAnswer.isCorrect && <AiExplainButton key={`${userAnswer.id}:${userAnswer.explanationHidden ? "hidden" : "visible"}`} userAnswerId={userAnswer.id} initialExplanation={userAnswer.aiExplanation} />}
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
