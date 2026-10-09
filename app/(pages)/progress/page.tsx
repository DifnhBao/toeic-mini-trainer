import Link from 'next/link';
import AppHeader from '@/app/components/AppHeader';
import { currentWebUser } from '@/app/lib/request-user';
import { LearningInsightsView } from '@/app/components/LearningInsightsView';

export default async function ProgressPage() {
  const user = await currentWebUser();
  return <div className="app-page"><AppHeader /><main className="page-shell insights-page">
    <div className="insights-header"><div><p className="eyebrow">ĐỊNH HƯỚNG HỌC TẬP</p><h1>Biết rõ nên tập trung vào đâu</h1><p>Đánh giá và gợi ý luyện tập từ kết quả đã nộp của bạn.</p></div><Link href="/history" className="ghost-button">Lịch sử bài làm →</Link></div>
    {user ? <LearningInsightsView key={user.id} userId={user.id} /> : <div className="history-empty"><strong>Đăng nhập để xem phân tích cá nhân</strong><p>Kết quả chỉ dành cho tài khoản đã làm bài.</p><Link href="/">Về trang chủ để đăng nhập</Link></div>}
  </main></div>;
}
