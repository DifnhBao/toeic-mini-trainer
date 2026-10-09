import type { LearningInsights, PartInsight, PracticeRecommendation, SkillInsight } from '@/shared/learning-insights';

export type InsightAnswer = {
  questionId: string; part: number; selectedOption: string | null; isCorrect: boolean;
  skills: Array<{ id: string; name: string }>;
};
export type InsightAttempt = { id: string; completedAt: Date; answers: InsightAnswer[] };
const day = 86400000;
const partMinimum = 20, skillMinimum = 10, trendMinimum = 10;
const titles = ['Mô tả tranh', 'Hỏi – đáp', 'Hội thoại', 'Bài nói', 'Hoàn thành câu', 'Hoàn thành đoạn', 'Đọc hiểu'];
const guidance = [
  'Đối chiếu hình với từng lựa chọn; sau nộp, ghi lại chỗ bạn nghe nhầm.',
  'Sau nộp, nghe lại câu hỏi và xác định vì sao lựa chọn của bạn không phù hợp.',
  'Đọc trước nhóm câu hỏi; sau nộp, đối chiếu từng đáp án với đoạn hội thoại.',
  'Đọc trước nhóm câu hỏi; sau nộp, tìm đoạn trong bài nói hỗ trợ đáp án.',
  'Sau nộp, ghi lại từ hoặc quy tắc của từng câu sai và giải thích vì sao chọn lại.',
  'Đọc cả đoạn trước khi chọn; sau nộp, đối chiếu câu sai với ngữ cảnh xung quanh.',
  'Sau nộp, tìm câu hoặc chi tiết trong đoạn đọc làm bằng chứng cho mỗi đáp án.',
];
const accuracy = (correct: number, total: number) => total ? Math.round(correct / total * 1000) / 10 : null;
const outcome = (answer: InsightAnswer) => !answer.selectedOption?.trim() ? 'skipped' : answer.isCorrect ? 'correct' : 'wrong';
function distinct(attempts: InsightAttempt[]) {
  const answers = new Map<string, InsightAnswer>();
  // Caller supplies newest-first attempts. Repeated questions count only once,
  // including a latest blank response: never fall back to an older correct one.
  for (const attempt of attempts) for (const answer of attempt.answers) {
    if (answer.part >= 1 && answer.part <= 7 && Number.isInteger(answer.part) && !answers.has(answer.questionId)) answers.set(answer.questionId, answer);
  }
  return [...answers.values()];
}
function counts(answers: InsightAnswer[]) {
  const correct = answers.filter(a => outcome(a) === 'correct').length;
  const skipped = answers.filter(a => outcome(a) === 'skipped').length;
  return { questions: answers.length, correct, skipped, wrong: answers.length - correct - skipped, accuracy: accuracy(correct, answers.length) };
}

export function buildLearningInsights(input: InsightAttempt[], now: Date, limited = false, available?: Readonly<Record<number, number>>): LearningInsights {
  if (!Number.isFinite(now.getTime())) throw new Error('InvalidInsightTime');
  const from = now.getTime() - 30 * day, midpoint = now.getTime() - 15 * day;
  const ids = new Set<string>();
  const attempts = input.filter(a => a.completedAt.getTime() >= from && a.completedAt.getTime() <= now.getTime())
    .slice().sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .filter(a => { if (ids.has(a.id)) return false; ids.add(a.id); return true; });
  const all = distinct(attempts);
  const previous = distinct(attempts.filter(a => a.completedAt.getTime() < midpoint));
  const recent = distinct(attempts.filter(a => a.completedAt.getTime() >= midpoint));
  const parts: PartInsight[] = titles.map((title, index) => {
    const part = index + 1, sample = counts(all.filter(a => a.part === part));
    const before = previous.filter(a => a.part === part), after = recent.filter(a => a.part === part);
    const beforeStats = counts(before), afterStats = counts(after), beforeIds = new Set(before.map(a => a.questionId));
    const enoughTrend = before.length >= trendMinimum && after.length >= trendMinimum;
    const changeNumerator = afterStats.correct * before.length - beforeStats.correct * after.length;
    const changeDenominator = before.length * after.length;
    const changePoints = enoughTrend ? Math.round(changeNumerator / changeDenominator * 1000) / 10 : null;
    const availableQuestions = available ? available[part] ?? 0 : null;
    if (availableQuestions !== null && (!Number.isSafeInteger(availableQuestions) || availableQuestions < 0)) throw new Error('InvalidInsightAvailability');
    return { part, title, ...sample, availableQuestions,
      evidence: sample.questions === 0 ? 'none' : sample.questions < partMinimum ? 'limited' : 'initial',
      assessment: sample.questions === 0 ? 'unseen' : sample.questions < partMinimum ? 'collect_more' :
        sample.correct / sample.questions < 0.7 ? 'focus' : sample.correct / sample.questions < 0.8 ? 'consolidate' : 'maintain',
      // Compare exact count ratios for direction; rounding is only for display.
      trend: { direction: !enoughTrend ? 'insufficient' : changeNumerator * 10 >= changeDenominator ? 'up' : changeNumerator * 10 <= -changeDenominator ? 'down' : 'stable',
        previousQuestions: before.length, recentQuestions: after.length,
        previousAccuracy: beforeStats.accuracy, recentAccuracy: afterStats.accuracy, changePoints,
        repeatedQuestions: after.filter(a => beforeIds.has(a.questionId)).length },
    };
  });
  const skillsById = new Map<string, { name: string; answers: InsightAnswer[] }>();
  for (const answer of all) {
    for (const skill of new Map(answer.skills.map(s => [s.id, s])).values()) {
      const existing = skillsById.get(skill.id);
      if (existing) existing.answers.push(answer);
      else skillsById.set(skill.id, { name: skill.name, answers: [answer] });
    }
  }
  const skills: SkillInsight[] = [...skillsById].map(([id, entry]) => {
    const sample = counts(entry.answers);
    return { id, name: entry.name, questions: sample.questions, correct: sample.correct, skipped: sample.skipped,
      accuracy: sample.accuracy!, needsPractice: sample.questions >= skillMinimum && sample.correct / sample.questions < 0.7,
      evidence: sample.questions >= skillMinimum ? 'initial' : 'limited',
      parts: [...new Set(entry.answers.map(a => a.part))].sort((a, b) => a - b) } as SkillInsight;
  }).sort((a, b) => Number(b.needsPractice) - Number(a.needsPractice) || a.accuracy - b.accuracy || b.questions - a.questions || a.id.localeCompare(b.id)).slice(0, 8);
  const chosen: PartInsight[] = [];
  const eligible = parts.filter(p => p.availableQuestions === null || p.availableQuestions > 0);
  const focus = eligible.filter(p => p.assessment === 'focus' || p.assessment === 'consolidate')
    .sort((a, b) => a.accuracy! - b.accuracy! || b.questions - a.questions || a.part - b.part);
  chosen.push(...focus.slice(0, 2));
  const exploration = eligible.filter(p => p.questions < partMinimum).sort((a, b) => Number(a.questions === 0) - Number(b.questions === 0) || b.questions - a.questions || a.part - b.part);
  if (exploration.length) chosen.push(exploration[0]);
  const maintenance = eligible.filter(p => p.assessment === 'maintain').sort((a, b) => a.accuracy! - b.accuracy! || a.part - b.part);
  if (chosen.length < 3 && maintenance.length) chosen.push(maintenance[0]);
  if (chosen.length < 3) chosen.push(...exploration.filter(p => !chosen.includes(p)).slice(0, 3 - chosen.length));
  const recommendations: PracticeRecommendation[] = chosen.map(p => {
    const kind = p.questions < partMinimum ? 'explore' : p.assessment === 'maintain' ? 'maintain' : 'focus';
    const count = Math.max(5, Math.min(10, p.availableQuestions ?? 10));
    return { kind, part: p.part, count,
      title: kind === 'explore' ? `Khảo sát thêm Part ${p.part}` : kind === 'maintain' ? `Duy trì Part ${p.part}` : `Tập trung Part ${p.part}`,
      reason: kind === 'explore' ? p.questions === 0 ? 'Bạn chưa làm câu nào ở Part này trong khoảng đang phân tích.' :
        `Mới có ${p.questions} câu khác nhau; cần ít nhất ${partMinimum} câu để đưa ra đánh giá ban đầu.` :
        `Bạn đúng ${p.correct}/${p.questions} câu khác nhau (${p.accuracy}%). Mẫu gần đây có ${p.skipped} câu bỏ trống.`,
      steps: [`Làm tối đa ${count} câu Part ${p.part}, ưu tiên câu chưa luyện nếu kho có sẵn.`, guidance[p.part - 1],
        p.questions >= 10 && p.skipped / p.questions >= 0.2 ?
          'Ghi lại lý do bỏ trống từng câu; sau nộp, thử giải lại trước khi xem lời giải.' :
          'Sau buổi luyện, mở lại phân tích để xem kết quả mới; ưu tiên kiểm tra bằng câu khác.'],
    };
  });
  const sample = counts(all);
  return { version: 1, generatedAt: now.toISOString(),
    window: { from: new Date(from).toISOString(), to: now.toISOString(), days: 30, limited, attemptLimit: 100, answersPerAttemptLimit: 50 },
    summary: { attempts: attempts.length, answerEvents: attempts.reduce((sum, a) => sum + a.answers.length, 0), uniqueQuestions: sample.questions,
      correct: sample.correct, wrong: sample.wrong, skipped: sample.skipped, accuracy: sample.accuracy,
      taggedQuestions: all.filter(a => a.skills.length > 0).length },
    parts, skills, recommendations,
    method: { partMinimum, skillMinimum, trendMinimum, practiceTarget: 70, distinctQuestionsOnly: true } };
}
