import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLearningInsights, type InsightAnswer, type InsightAttempt } from '../app/lib/learning-insights';

const now = new Date('2026-10-09T10:00:00Z');
function attempt(id: string, part: number, total: number, correct: number, skipped = 0, ageDays = 0): InsightAttempt {
  return { id, completedAt: new Date(now.getTime() - ageDays * 86400000), answers: Array.from({ length: total }, (_, i) => ({
    questionId: `${id}-q-${i}`, part, selectedOption: i >= total - skipped ? null : 'A', isCorrect: i < correct, skills: [],
  })) };
}

test('new learner receives exploration, no zero-percent weakness or invented skill diagnosis', () => {
  const result = buildLearningInsights([], now);
  assert.equal(result.summary.accuracy, null);
  assert.ok(result.parts.every(p => p.accuracy === null && p.assessment === 'unseen' && p.evidence === 'none'));
  assert.ok(result.recommendations.length > 0 && result.recommendations.every(r => r.kind === 'explore'));
  assert.equal(result.skills.length, 0);
});

test('recommendations use only Parts with eligible bank content and preserve assessments for currently unavailable weak Parts', () => {
  const input = [attempt('weak', 2, 20, 0), attempt('partial', 5, 12, 2)];
  const result = buildLearningInsights(input, now, false, { 5: 3 });
  assert.equal(result.parts[1].assessment, 'focus'); assert.equal(result.parts[1].availableQuestions, 0);
  assert.deepEqual(result.recommendations.map(r => r.part), [5]); assert.equal(result.recommendations[0].count, 5);
  assert.equal(buildLearningInsights([], now, false, {}).recommendations.length, 0);
});

test('one question repeated many times is limited evidence and the newest blank supersedes older correct answers', () => {
  const repeated = Array.from({ length: 30 }, (_, i) => {
    const a = attempt(`repeat-${i}`, 5, 1, i ? 1 : 0, i ? 0 : 1, i / 10);
    a.answers[0].questionId = 'same-question'; return a;
  });
  const value = buildLearningInsights(repeated.reverse(), now);
  assert.equal(value.summary.attempts, 30); assert.equal(value.summary.answerEvents, 30);
  assert.equal(value.summary.uniqueQuestions, 1); assert.equal(value.summary.correct, 0); assert.equal(value.summary.skipped, 1);
  assert.equal(value.parts[4].assessment, 'collect_more');
  assert.ok(value.recommendations.every(r => r.kind !== 'focus'));
});

test('assessments honor minimum sample and exact accuracy thresholds including rounding edges', () => {
  const values = [attempt('few', 1, 19, 0), attempt('weak', 2, 20, 13), attempt('border', 3, 20, 14),
    attempt('good', 4, 20, 16), attempt('rounding', 5, 23, 16)];
  const result = buildLearningInsights(values, now);
  assert.equal(result.parts[0].assessment, 'collect_more'); assert.equal(result.parts[1].assessment, 'focus');
  assert.equal(result.parts[2].assessment, 'consolidate'); assert.equal(result.parts[3].assessment, 'maintain');
  assert.equal(result.parts[4].assessment, 'focus');
  assert.equal(result.parts[4].accuracy, 69.6);
  assert.equal(result.recommendations[0].part, 2);
  assert.ok(result.recommendations.length <= 3);
});

test('wrong and skipped stay separate even if an old blank record incorrectly says isCorrect', () => {
  const a = attempt('blank', 6, 20, 10, 4);
  a.answers[19].isCorrect = true;
  const part = buildLearningInsights([a], now).parts[5];
  assert.equal(part.correct, 10); assert.equal(part.wrong, 6); assert.equal(part.skipped, 4); assert.equal(part.accuracy, 50);
  assert.ok(buildLearningInsights([a], now).recommendations[0].steps.some(s => s.includes('lý do bỏ trống')));
});

test('window excludes old/future attempts and reports capped coverage without changing source evidence', () => {
  const input = [attempt('old', 7, 20, 20, 0, 31), attempt('future', 7, 20, 0, 0, -1), attempt('in', 7, 20, 10, 0, 30)];
  const original = JSON.stringify(input);
  const result = buildLearningInsights(input, now, true);
  assert.equal(result.summary.attempts, 1); assert.equal(result.summary.uniqueQuestions, 20);
  assert.equal(result.window.limited, true); assert.equal(JSON.stringify(input), original);
});

test('trend compares the same Part with sufficient distinct samples and exposes repeated questions', () => {
  const before = attempt('before', 5, 20, 8, 0, 20), after = attempt('after', 5, 20, 18, 0, 2);
  after.answers.forEach((a, i) => { a.questionId = before.answers[i].questionId; });
  const mixed = attempt('easy-other-part', 7, 20, 20, 0, 1);
  const result = buildLearningInsights([before, mixed, after], now);
  assert.equal(result.parts[4].trend.changePoints, 50); assert.equal(result.parts[4].trend.direction, 'up');
  assert.equal(result.parts[4].trend.repeatedQuestions, 20); assert.equal(result.parts[4].questions, 20);
  assert.equal(result.parts[6].trend.direction, 'insufficient');
});

test('small comparison samples do not receive a trend despite a dramatic accuracy difference', () => {
  const result = buildLearningInsights([attempt('before', 3, 9, 0, 0, 20), attempt('after', 3, 10, 10, 0, 1)], now);
  assert.equal(result.parts[2].trend.direction, 'insufficient'); assert.equal(result.parts[2].trend.changePoints, null);
});

test('trend displays one decimal without floating artifacts and classifies the unrounded difference', () => {
  const input = [attempt('old-fraction', 5, 30, 10, 0, 20), attempt('new-fraction', 5, 30, 23, 0, 1),
    attempt('old-near', 6, 50, 0, 0, 20), attempt('new-near', 6, 101, 10, 0, 1),
    attempt('old-exact', 7, 10, 3, 0, 20), attempt('new-exact', 7, 10, 4, 0, 1)];
  const result = buildLearningInsights(input, now);
  assert.equal(result.parts[4].trend.changePoints, 43.3);
  assert.equal(result.parts[4].trend.direction, 'up');
  assert.equal(result.parts[5].trend.changePoints, 9.9);
  assert.equal(result.parts[5].trend.direction, 'stable');
  assert.equal(result.parts[6].trend.changePoints, 10);
  assert.equal(result.parts[6].trend.direction, 'up');
});

test('only bank-provided skills are counted, duplicate labels count once and low coverage stays visible', () => {
  const a = attempt('tags', 5, 20, 4);
  const tag = { id: 'grammar', name: 'Ngữ pháp' };
  a.answers.slice(0, 10).forEach(answer => { answer.skills = [tag, tag]; });
  a.answers[0].skills.push({ id: 'vocabulary', name: 'Từ vựng' });
  const result = buildLearningInsights([a], now);
  assert.equal(result.summary.taggedQuestions, 10);
  const grammar = result.skills.find(s => s.id === 'grammar')!;
  assert.equal(grammar.questions, 10); assert.equal(grammar.needsPractice, true);
  assert.equal(result.skills.find(s => s.id === 'vocabulary')!.evidence, 'limited');
  assert.equal(result.skills.length, 2);
});

test('duplicate attempts and equal-time response order do not inflate evidence or make outcomes nondeterministic', () => {
  const a = attempt('a', 2, 1, 1), b = attempt('b', 2, 1, 0);
  b.answers[0].questionId = a.answers[0].questionId;
  const result = buildLearningInsights([a, a, b], now);
  assert.equal(result.summary.attempts, 2); assert.equal(result.summary.correct, 0);
  assert.deepEqual(result, buildLearningInsights([b, a], now));
});

test('no result response contains raw question IDs, answer choices or private attempt IDs', () => {
  const a = attempt('private-attempt', 1, 20, 10);
  a.answers[0].selectedOption = 'private-answer';
  const response = JSON.stringify(buildLearningInsights([a], now));
  assert.ok(!response.includes('private-attempt')); assert.ok(!response.includes('private-answer'));
  assert.ok(!response.includes('questionId')); assert.ok(!response.includes('selectedOption'));
});

test('invalid Part records do not become an eighth Part or a focus recommendation', () => {
  const a = attempt('invalid', 8, 20, 0);
  a.answers.push({ questionId: 'valid', part: 5, selectedOption: 'A', isCorrect: false, skills: [] } as InsightAnswer);
  const result = buildLearningInsights([a], now);
  assert.equal(result.parts.length, 7); assert.equal(result.summary.uniqueQuestions, 1);
});
