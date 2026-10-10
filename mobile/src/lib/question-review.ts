import type { ExtractedQuestionGroup } from '../types/learning';

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type DraftQuestion = { part: number; content: string; options: Record<string, string>; correctAnswer: string };
export type ReviewEntry = {
  groupIndex: number; questionIndex: number;
  decision: 'PENDING' | 'APPROVE' | 'SKIP'; question: DraftQuestion;
};

export function assertReviewProtocol(job: { reviewProtocol?: number }) {
  if (job.reviewProtocol !== 1) throw new Error('API chưa hỗ trợ duyệt từng câu. Cần cập nhật server trước khi lưu hoặc gửi đóng góp.');
}

export function initialEntries(groups: ExtractedQuestionGroup[]): ReviewEntry[] {
  return groups.flatMap((group, groupIndex) => group.questions.map((question, questionIndex) => ({
    groupIndex, questionIndex, decision: 'PENDING',
    question: { ...question, content: question.content || '', options: { ...question.options } },
  })));
}

export function validationMessage(question: DraftQuestion): string | null {
  if (!Number.isInteger(question.part) || question.part < 1 || question.part > 7) return 'Part phải từ 1 đến 7.';
  if (question.content.trim().length > 10_000) return 'Nội dung quá dài.';
  if (question.part >= 3 && !question.content.trim()) return 'Câu hỏi Part 3–7 cần có nội dung.';
  const filled = OPTION_KEYS.filter((key) => question.options[key]?.trim());
  if (filled.length < 2) return 'Cần ít nhất hai phương án có nội dung.';
  if (Object.keys(question.options).some((key) => !OPTION_KEYS.includes(key as typeof OPTION_KEYS[number]))) return 'Phương án chỉ được là A–D.';
  if (filled.some((key) => question.options[key].trim().length > 4_000)) return 'Phương án quá dài.';
  if (!filled.includes(question.correctAnswer as typeof OPTION_KEYS[number])) return 'Đáp án đúng phải có nội dung.';
  return null;
}

export function editEntry(entries: ReviewEntry[], index: number, question: DraftQuestion): ReviewEntry[] {
  return entries.map((entry, position) => position === index ? { ...entry, question, decision: 'PENDING' } : entry);
}

export function reviewCounts(entries: ReviewEntry[]) {
  return {
    approved: entries.filter((entry) => entry.decision === 'APPROVE').length,
    skipped: entries.filter((entry) => entry.decision === 'SKIP').length,
    pending: entries.filter((entry) => entry.decision === 'PENDING').length,
  };
}

export function buildReviewPayload(entries: ReviewEntry[]) {
  const counts = reviewCounts(entries);
  if (!counts.approved || counts.pending || entries.some((entry) => entry.decision === 'APPROVE' && validationMessage(entry.question))) {
    throw new Error('Hãy duyệt hoặc bỏ qua tất cả câu hỏi và giữ ít nhất một câu hợp lệ.');
  }
  return { reviews: entries.map(({ groupIndex, questionIndex, decision, question }) => decision === 'APPROVE'
    ? { groupIndex, questionIndex, decision: 'APPROVE' as const, question: {
      part: question.part, content: question.content.trim() || null,
      options: Object.fromEntries(OPTION_KEYS.flatMap((key) => question.options[key]?.trim() ? [[key, question.options[key].trim()]] : [])),
      correctAnswer: question.correctAnswer,
    } }
    : { groupIndex, questionIndex, decision: 'SKIP' as const }) };
}

// Local storage is untrusted. A corrupt draft must never restore approvals.
export function isValidDraftEntries(value: unknown, groups: ExtractedQuestionGroup[]): value is ReviewEntry[] {
  const expected = initialEntries(groups);
  if (!Array.isArray(value) || value.length !== expected.length) return false;
  return value.every((entry, index) => {
    if (!entry || typeof entry !== 'object' || entry.groupIndex !== expected[index].groupIndex ||
      entry.questionIndex !== expected[index].questionIndex || !['PENDING', 'APPROVE', 'SKIP'].includes(entry.decision)) return false;
    const q = entry.question;
    if (!q || typeof q !== 'object' || !Number.isInteger(q.part) || q.part < 1 || q.part > 7 ||
      typeof q.content !== 'string' || q.content.length > 10_000 || typeof q.correctAnswer !== 'string' ||
      !q.options || typeof q.options !== 'object' || Array.isArray(q.options) ||
      Object.entries(q.options).some(([key, text]) => !OPTION_KEYS.includes(key as typeof OPTION_KEYS[number]) || typeof text !== 'string' || text.length > 4_000)) return false;
    return entry.decision !== 'APPROVE' || validationMessage(q) === null;
  });
}
