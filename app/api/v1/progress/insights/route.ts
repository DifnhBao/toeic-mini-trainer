import { apiError, apiJson } from '@/app/lib/api-response';
import { requestUser } from '@/app/lib/request-user';
import { learningInsights } from '@/app/lib/learning-insights-data';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await requestUser(request);
  if (!user) return apiError('UNAUTHORIZED', 'Bạn cần đăng nhập để xem phân tích học tập.', 401);
  return apiJson(await learningInsights(user.id));
}
