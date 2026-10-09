'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import type { LearningInsights, PartInsight, PracticeRecommendation } from '@/shared/learning-insights';
import { apiFailureMessage } from '@/shared/response-diagnostics';
import './learning-insights.css';

const labels: Record<PartInsight['assessment'], string> = {
  unseen: 'Chưa có dữ liệu', collect_more: 'Cần thêm dữ liệu', focus: 'Ưu tiên cải thiện', consolidate: 'Tiếp tục củng cố', maintain: 'Đang làm tốt',
};
export function LearningInsightsView({ userId }: { userId: string }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const activeUserId = status === 'authenticated' ? session?.user?.id : undefined;
  const [loaded, setLoaded] = useState<{ userId: string; value: LearningInsights } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [starting, setStarting] = useState<number | null>(null);
  const data = activeUserId === userId && loaded?.userId === activeUserId ? loaded.value : null;
  useEffect(() => {
    if (!activeUserId || activeUserId !== userId) return;
    const controller = new AbortController();
    fetch('/api/v1/progress/insights', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) throw new Error(apiFailureMessage(response, payload, 'Không tải được phân tích.'));
      if (!controller.signal.aborted) { setLoaded({ userId, value: payload }); setError(''); }
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được phân tích.'); });
    return () => controller.abort();
  }, [userId, activeUserId, retry]);

  async function start(recommendation: PracticeRecommendation) {
    if (starting !== null || activeUserId !== userId) return;
    setStarting(recommendation.part); setError('');
    try {
      const response = await fetch('/api/v1/tests', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts: [recommendation.part], count: recommendation.count, preferUnseen: true }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.test?.id) throw new Error(apiFailureMessage(response, payload, 'Không tạo được bài luyện.'));
      router.push(`/tests/${payload.test.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tạo được bài luyện.'); }
    finally { setStarting(null); }
  }
  if (status === 'unauthenticated' || (activeUserId && activeUserId !== userId)) return <p>Phiên đăng nhập đã thay đổi. <Link href="/">Về trang chủ và mở lại phân tích.</Link></p>;
  return <div className="insights-content">
    {error && <div className="insights-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Tải lại phân tích</button><Link href="/library">Xem Kho bài</Link></div>}
    {!data ? !error && <p role="status">Đang phân tích kết quả đã nộp…</p> : <>
      <p className="insights-method">30 ngày gần nhất · {data.summary.attempts} bài đã nộp · {data.summary.answerEvents} lượt trả lời · {data.summary.uniqueQuestions} câu khác nhau. Mỗi câu dùng lần trả lời mới nhất.</p>
      {data.window.limited && <p className="insights-warning">Bạn có nhiều dữ liệu hơn phạm vi đọc: kết quả này chỉ dùng tối đa 100 bài gần nhất, tối đa 50 câu mỗi bài.</p>}
      {data.summary.uniqueQuestions === 0 && <div className="insights-empty"><h2>Bắt đầu tạo mốc học tập</h2><p>Chưa có kết quả trong 30 ngày gần nhất. Làm một bài ngắn rồi quay lại; hệ thống sẽ phân tích sau khi bạn nộp.</p></div>}
      <section aria-labelledby="insights-next"><h2 id="insights-next">Buổi luyện tiếp theo</h2><div className="insights-recommendations">
        {data.recommendations.map(item => <article className="insight-recommendation" key={item.part}>
          <span className="insight-kicker">{item.kind === 'focus' ? 'TẬP TRUNG' : item.kind === 'explore' ? 'KHẢO SÁT' : 'DUY TRÌ'}</span>
          <h3>{item.title}</h3><p>{item.reason}</p><ol>{item.steps.map(step => <li key={step}>{step}</li>)}</ol>
          <button type="button" disabled={starting !== null} onClick={() => start(item)}>{starting === item.part ? 'Đang tạo bài…' : `Luyện tối đa ${item.count} câu Part ${item.part}`} →</button>
        </article>)}
      </div>{data.recommendations.length === 0 && <p>Kho chưa có câu hỏi phù hợp với quyền truy cập của bạn. <Link href="/library">Kiểm tra Kho bài</Link> hoặc quay lại khi có nội dung mới.</p>}<p className="insights-method">Bài gợi ý ưu tiên câu chưa làm. Nếu kho không đủ, bài có thể gồm câu đã luyện.</p></section>
      <section aria-labelledby="insights-parts"><h2 id="insights-parts">Bạn đang làm tốt và cần cải thiện ở đâu?</h2><div className="insight-part-grid">
        {data.parts.map(p => <article className={`insight-part insight-part-${p.assessment}`} key={p.part}>
          <div className="insight-part-heading"><h3>Part {p.part} · {p.title}</h3><span>{labels[p.assessment]}</span></div>
          <strong className="insight-accuracy">{p.accuracy === null ? '—' : `${p.accuracy}%`}</strong>
          <p>{p.questions === 0 ? 'Chưa có câu đã nộp trong khoảng phân tích.' : `${p.correct} đúng · ${p.wrong} sai · ${p.skipped} bỏ trống / ${p.questions} câu khác nhau`}</p>
          <p className="insights-method">Kho câu hỏi bạn được dùng: {p.availableQuestions ?? 'chưa xác định'} câu.</p>
          {p.evidence === 'limited' && <p className="insights-method">Cần ít nhất {data.method.partMinimum} câu khác nhau để có đánh giá ban đầu.</p>}
          {p.trend.direction === 'insufficient' ? <p className="insights-method">Chưa đủ dữ liệu so xu hướng: mỗi nửa 15 ngày cần ít nhất {data.method.trendMinimum} câu khác nhau.</p> : <p className="insights-method">Hai nửa 15 ngày: {p.trend.previousAccuracy}% → {p.trend.recentAccuracy}% ({p.trend.changePoints! > 0 ? '+' : ''}{p.trend.changePoints} điểm phần trăm). Mẫu {p.trend.previousQuestions}/{p.trend.recentQuestions} câu, trùng {p.trend.repeatedQuestions} câu.</p>}
        </article>)}
      </div></section>
      <section aria-labelledby="insights-skills"><h2 id="insights-skills">Kỹ năng từ câu đã gắn nhãn</h2><p className="insights-method">{data.summary.taggedQuestions}/{data.summary.uniqueQuestions} câu có nhãn. Một câu có thể mang nhiều nhãn; câu chưa có nhãn không được tự gán kỹ năng.</p>
        {data.skills.length === 0 ? <p>Chưa có đủ nội dung gắn nhãn để phân tích kỹ năng cụ thể.</p> : <div className="insight-skill-list">{data.skills.map(skill => <div key={skill.id}><strong>{skill.name}</strong><span>{skill.correct}/{skill.questions} đúng · {skill.accuracy}% · {skill.evidence === 'limited' ? 'Cần thêm dữ liệu' : skill.needsPractice ? 'Cần luyện thêm' : 'Tiếp tục theo dõi'}</span></div>)}</div>}
      </section>
      <aside className="insights-limits"><strong>Đọc kết quả đúng cách</strong><p>Đây là đánh giá từ bài bạn đã luyện, không quy đổi thành điểm TOEIC. Các bài có thể khác độ khó và câu làm lại có thể dễ nhớ hơn; xu hướng tỷ lệ đúng chưa chứng minh trình độ tăng hoặc giảm. Ngưỡng 70% dùng để chọn buổi luyện, không phải điểm thi.</p></aside>
    </>}
  </div>;
}
