import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette, radius } from '@/constants/design';
import { useAuth } from '@/providers/auth-provider';
import type { LearningInsights, PartInsight, PracticeRecommendation } from '@/types/learning';

const labels: Record<PartInsight['assessment'], string> = {
  unseen: 'Chưa có dữ liệu', collect_more: 'Cần thêm dữ liệu', focus: 'Ưu tiên cải thiện', consolidate: 'Tiếp tục củng cố', maintain: 'Đang làm tốt',
};
export default function InsightsScreen() {
  const { user, authorizedFetch } = useAuth();
  const [loaded, setLoaded] = useState<{ owner: string; revision: number; value: LearningInsights } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [starting, setStarting] = useState<number | null>(null);
  const data = loaded?.owner === user?.id && loaded?.revision === retry ? loaded?.value : null;

  useFocusEffect(useCallback(() => {
    let active = true;
    const owner = user?.id;
    setLoading(true); setError(''); setLoaded(null);
    if (owner) authorizedFetch<LearningInsights>('/api/v1/progress/insights').then(value => {
      if (active) setLoaded({ owner, revision: retry, value });
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'Không tải được phân tích.');
    }).finally(() => { if (active) setLoading(false); });
    else setLoading(false);
    return () => { active = false; };
  }, [authorizedFetch, user?.id, retry]));

  async function start(item: PracticeRecommendation) {
    if (starting !== null) return;
    setStarting(item.part); setError('');
    try {
      const result = await authorizedFetch<{ test: { id: string } }>('/api/v1/tests', {
        method: 'POST', body: JSON.stringify({ parts: [item.part], count: item.count, preferUnseen: true }),
      });
      router.push(`/test/${result.test.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tạo được bài luyện.'); }
    finally { setStarting(null); }
  }
  return <SafeAreaView edges={['bottom']} style={styles.safeArea}><ScrollView contentContainerStyle={styles.content}>
    <View><Text style={styles.kicker}>ĐỊNH HƯỚNG HỌC TẬP</Text><Text style={styles.title}>Nên tập trung vào đâu?</Text><Text style={styles.copy}>Đánh giá và gợi ý từ kết quả đã nộp của bạn, không cần hỏi AI.</Text></View>
    {loading && <View style={styles.loading}><ActivityIndicator color={palette.primary} /><Text style={styles.copy}>Đang phân tích kết quả…</Text></View>}
    {!!error && <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable onPress={() => setRetry(n => n + 1)} style={styles.secondaryButton}><Text style={styles.linkText}>Tải lại phân tích</Text></Pressable><Pressable onPress={() => router.push('/library')}><Text style={styles.linkText}>Xem Kho bài →</Text></Pressable></View>}
    {!loading && data && <>
      <Text style={styles.small}>30 ngày gần nhất · {data.summary.attempts} bài đã nộp · {data.summary.answerEvents} lượt trả lời · {data.summary.uniqueQuestions} câu khác nhau. Mỗi câu dùng lần trả lời mới nhất.</Text>
      {data.window.limited && <View style={styles.warning}><Text style={styles.copy}>Kết quả chỉ bao phủ tối đa 100 bài gần nhất, 50 câu mỗi bài; bạn có nhiều dữ liệu hơn phạm vi này.</Text></View>}
      {data.summary.uniqueQuestions === 0 && <View style={styles.card}><Text style={styles.heading}>Bắt đầu tạo mốc học tập</Text><Text style={styles.copy}>Chưa có kết quả trong 30 ngày gần nhất. Làm một bài ngắn rồi quay lại sau khi nộp.</Text></View>}
      <Text style={styles.heading}>Buổi luyện tiếp theo</Text>
      {data.recommendations.map(item => <View style={styles.card} key={item.part}>
        <Text style={styles.kicker}>{item.kind === 'focus' ? 'TẬP TRUNG' : item.kind === 'explore' ? 'KHẢO SÁT' : 'DUY TRÌ'}</Text>
        <Text style={styles.heading}>{item.title}</Text><Text style={styles.copy}>{item.reason}</Text>
        {item.steps.map((step, index) => <Text key={step} style={styles.copy}>{index + 1}. {step}</Text>)}
        <Pressable accessibilityRole="button" disabled={starting !== null} onPress={() => start(item)} style={[styles.button, starting !== null && styles.disabled]}>
          {starting === item.part ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Luyện tối đa {item.count} câu Part {item.part} →</Text>}
        </Pressable>
      </View>)}
      {data.recommendations.length === 0 && <View style={styles.card}><Text style={styles.copy}>Kho chưa có câu hỏi phù hợp với quyền truy cập của bạn. Quay lại khi có nội dung mới.</Text><Pressable onPress={() => router.push('/library')}><Text style={styles.linkText}>Kiểm tra Kho bài →</Text></Pressable></View>}
      <Text style={styles.small}>Ưu tiên câu chưa làm. Nếu kho không đủ, bài có thể gồm câu đã luyện.</Text>
      <Text style={styles.heading}>Đánh giá theo Part</Text>
      {data.parts.map(p => <View key={p.part} style={[styles.card, p.assessment === 'focus' && styles.focusCard]}>
        <Text style={styles.heading}>Part {p.part} · {p.title}</Text><Text style={styles.label}>{labels[p.assessment]}</Text>
        <Text style={styles.accuracy}>{p.accuracy === null ? '—' : `${p.accuracy}%`}</Text>
        <Text style={styles.copy}>{p.questions === 0 ? 'Chưa có câu đã nộp trong khoảng phân tích.' : `${p.correct} đúng · ${p.wrong} sai · ${p.skipped} bỏ trống / ${p.questions} câu khác nhau`}</Text>
        <Text style={styles.small}>Kho câu hỏi bạn được dùng: {p.availableQuestions ?? 'chưa xác định'} câu.</Text>
        {p.evidence === 'limited' && <Text style={styles.small}>Cần ít nhất {data.method.partMinimum} câu khác nhau để có đánh giá ban đầu.</Text>}
        {p.trend.direction === 'insufficient' ? <Text style={styles.small}>Chưa đủ dữ liệu so xu hướng: mỗi nửa 15 ngày cần ít nhất {data.method.trendMinimum} câu khác nhau.</Text> : <Text style={styles.small}>Hai nửa 15 ngày: {p.trend.previousAccuracy}% → {p.trend.recentAccuracy}% ({p.trend.changePoints! > 0 ? '+' : ''}{p.trend.changePoints} điểm phần trăm). Mẫu {p.trend.previousQuestions}/{p.trend.recentQuestions} câu, trùng {p.trend.repeatedQuestions} câu.</Text>}
      </View>)}
      <Text style={styles.heading}>Kỹ năng từ câu có nhãn</Text><Text style={styles.small}>{data.summary.taggedQuestions}/{data.summary.uniqueQuestions} câu có nhãn. Một câu có thể mang nhiều nhãn; câu chưa có nhãn không được tự gán kỹ năng.</Text>
      {data.skills.length === 0 ? <Text style={styles.copy}>Chưa có nội dung gắn nhãn để phân tích kỹ năng cụ thể.</Text> : data.skills.map(skill => <View style={styles.card} key={skill.id}><Text style={styles.heading}>{skill.name}</Text><Text style={styles.copy}>{skill.correct}/{skill.questions} đúng · {skill.accuracy}%</Text><Text style={styles.label}>{skill.evidence === 'limited' ? 'Cần thêm dữ liệu' : skill.needsPractice ? 'Cần luyện thêm' : 'Tiếp tục theo dõi'}</Text></View>)}
      <View style={styles.card}><Text style={styles.heading}>Đọc kết quả đúng cách</Text><Text style={styles.small}>Đánh giá từ bài đã luyện, không quy đổi điểm TOEIC. Các bài có thể khác độ khó và câu làm lại có thể dễ nhớ hơn; tỷ lệ đúng chưa chứng minh trình độ tăng hoặc giảm. Ngưỡng 70% dùng để chọn buổi luyện, không phải điểm thi.</Text></View>
    </>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 20, gap: 16 },
  title: { fontSize: 27, fontWeight: '800', color: palette.ink, marginTop: 6 },
  heading: { fontSize: 18, lineHeight: 25, fontWeight: '700', color: palette.ink },
  copy: { color: palette.ink, fontSize: 14, lineHeight: 21 }, small: { color: palette.muted, fontSize: 13, lineHeight: 20 },
  kicker: { color: palette.primary, fontSize: 11, letterSpacing: 1, fontWeight: '800' }, label: { color: palette.primaryDark, fontSize: 12, fontWeight: '700' },
  card: { padding: 18, gap: 10, backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radius.medium },
  focusCard: { borderColor: '#F5C69A' }, accuracy: { color: palette.ink, fontSize: 30, fontWeight: '800' },
  warning: { padding: 16, borderRadius: radius.small, backgroundColor: '#FFFAEB' }, loading: { paddingVertical: 24, gap: 12, alignItems: 'center' },
  button: { padding: 14, marginTop: 6, backgroundColor: palette.primary, borderRadius: radius.small, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.5 },
  error: { color: palette.danger, fontSize: 14, lineHeight: 21 }, linkText: { color: palette.primary, fontWeight: '700' },
  secondaryButton: { paddingVertical: 12 },
});
