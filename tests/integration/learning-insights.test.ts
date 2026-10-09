import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { SignJWT } from 'jose';
import type { PrismaClient } from '@prisma/client';
import type { LearningInsights } from '../../shared/learning-insights';

const database = process.env.TEST_DATABASE_URL;
if (!database || process.env.ALLOW_INTEGRATION_TEST_DATABASE !== 'true') throw new Error('Explicit isolated database required');
const target = new URL(database);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.pathname !== '/toeic_release_test' || process.env.NODE_ENV === 'production') throw new Error('Local test database required');
process.env.DATABASE_URL = database;
process.env.MOBILE_JWT_SECRET = 'integration-only-insights-secret';
process.env.RATE_LIMIT_STORE = 'database';
const userA = randomUUID(), userB = randomUUID(), userC = randomUUID();
const users = [userA, userB, userC];
const questions: string[] = Array.from({ length: 30 }, () => randomUUID());
const questionB = randomUUID(), tagId = randomUUID(), testA = randomUUID(), testB = randomUUID();
let prisma: PrismaClient;
let route: typeof import('../../app/api/v1/progress/insights/route');
let create: typeof import('../../app/api/v1/tests/route');
let read: typeof import('../../app/lib/learning-insights-data');
const now = new Date();
const date = (days: number) => new Date(now.getTime() - days * 86400000);

before(async () => {
  prisma = (await import('../../app/lib/prisma')).prisma;
  route = await import('../../app/api/v1/progress/insights/route');
  create = await import('../../app/api/v1/tests/route');
  read = await import('../../app/lib/learning-insights-data');
  await prisma.user.createMany({ data: users.map(id => ({ id, email: `${id}@test.invalid` })) });
  await prisma.question.createMany({ data: [...questions.map(id => ({ id, ownerId: userA, part: 5,
    content: 'Private insights question', options: { A: 'correct', B: 'wrong' }, correctAnswer: 'A' })),
    { id: questionB, ownerId: userB, part: 7, content: 'Other private question', options: { A: 'correct', B: 'wrong' }, correctAnswer: 'A' }] });
  await prisma.skillTag.create({ data: { id: tagId, name: `insight-fixture-${tagId}` } });
  await prisma.questionSkillTag.createMany({ data: questions.slice(0, 10).map(questionId => ({ questionId, skillTagId: tagId })) });
  await prisma.miniTest.create({ data: { id: testA, title: 'Private learning fixture', createdById: userA,
    questions: { create: questions.slice(0, 20).map((questionId, orderIndex) => ({ questionId, orderIndex })) } } });
  await prisma.miniTest.create({ data: { id: testB, title: 'Other learner', createdById: userB, questions: { create: [{ questionId: questionB, orderIndex: 1 }] } } });
  for (const [age, correct, score] of [[20, 8, 8], [2, 12, 12], [31, 20, 20], [1, 20, null]] as const) {
    await prisma.testAttempt.create({ data: { userId: userA, testId: testA, completedAt: date(age), score,
      userAnswers: { create: questions.slice(0, 20).map((questionId, index) => ({ questionId,
        selectedOption: index >= 16 && age === 2 ? null : index < correct ? 'A' : 'B', isCorrect: index < correct })) } } });
  }
  await prisma.testAttempt.create({ data: { userId: userB, testId: testB, score: 1, completedAt: date(1),
    userAnswers: { create: [{ questionId: questionB, selectedOption: 'A', isCorrect: true }] } } });
});
after(async () => {
  if (!prisma) return;
  await prisma.testAttempt.deleteMany({ where: { userId: { in: users } } });
  await prisma.miniTest.deleteMany({ where: { createdById: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.skillTag.deleteMany({ where: { id: tagId } });
  const scope = createHash('sha256').update(`mobile-test-create:${userA}`).digest('hex');
  await prisma.userAiUsage.deleteMany({ where: { key: { startsWith: 'rate:v1:', endsWith: `:${scope}` } } });
  await prisma.$disconnect();
});
async function request(user: string, body?: unknown) {
  const token = await new SignJWT({ tokenUse: 'access' }).setProtectedHeader({ alg: 'HS256' }).setSubject(user)
    .setIssuer('toeic-mini-trainer').setAudience('toeic-mobile').setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.MOBILE_JWT_SECRET));
  return new Request(`https://integration.invalid/insights?userId=${userB}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
describe('personal learning insights through PostgreSQL', () => {
  it('requires valid auth and isolates aggregate evidence even when caller supplies a different user ID', async () => {
    assert.equal((await route.GET(new Request('https://integration.invalid/insights', { headers: { authorization: 'Bearer invalid' } }))).status, 401);
    const response = await route.GET(await request(userA));
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control')!, /no-store/);
    const value: LearningInsights = await response.json();
    assert.equal(value.summary.attempts, 2); assert.equal(value.summary.answerEvents, 40); assert.equal(value.summary.uniqueQuestions, 20);
    assert.equal(value.summary.correct, 12); assert.equal(value.summary.wrong, 4); assert.equal(value.summary.skipped, 4);
    assert.equal(value.parts[4].assessment, 'focus'); assert.equal(value.parts[4].trend.changePoints, 20);
    assert.equal(value.parts[4].availableQuestions, 30); assert.equal(value.parts[6].availableQuestions, 0);
    assert.deepEqual(value.recommendations.map(r => r.part), [5]);
    assert.equal(value.parts[4].trend.repeatedQuestions, 20); assert.equal(value.parts[6].questions, 0);
    assert.equal(value.summary.taggedQuestions, 10); assert.equal(value.skills.length, 1);
    const serialized = JSON.stringify(value);
    for (const privateValue of [userA, userB, testA, testB, questions[0], 'Private insights question', 'correctAnswer', 'selectedOption']) assert.ok(!serialized.includes(privateValue));
    const other: LearningInsights = await (await route.GET(await request(userB))).json();
    assert.equal(other.summary.uniqueQuestions, 1); assert.equal(other.parts[4].questions, 0); assert.equal(other.skills.length, 0);
    const empty: LearningInsights = await (await route.GET(await request(userC))).json();
    assert.equal(empty.summary.accuracy, null); assert.ok(empty.recommendations.every(r => r.kind === 'explore'));
    assert.equal(empty.recommendations.length, 0);
  });
  it('recommendation practice selects unseen eligible questions first and never selects other private questions', async () => {
    const response = await create.POST(await request(userA, { parts: [5], count: 5, preferUnseen: true }));
    assert.equal(response.status, 201);
    const payload = await response.json();
    const selected = await prisma.miniTestQuestion.findMany({ where: { testId: payload.test.id } });
    assert.equal(selected.length, 5); assert.ok(selected.every(q => questions.slice(20).includes(q.questionId)));
    const invalid = await create.POST(await request(userA, { parts: [5], count: 10, preferUnseen: 'true' }));
    assert.equal(invalid.status, 400);
  });
  it('uses only the current account history when preferring unseen and falls back to seen questions when needed', async () => {
    const { selectPracticeQuestions } = await import('../../app/lib/learning-data');
    // B has seen this public fixture. A has not; B's history must not suppress it.
    const publicQuestion = randomUUID();
    await prisma.question.create({ data: { id: publicQuestion, part: 1, publicationStatus: 'PUBLISHED', options: { A: 'a', B: 'b' }, correctAnswer: 'A' } });
    try {
      await prisma.userAnswer.create({ data: { attemptId: (await prisma.testAttempt.findFirstOrThrow({ where: { userId: userB } })).id,
        questionId: publicQuestion, selectedOption: 'A', isCorrect: true } });
      const selected = await selectPracticeQuestions(userA, [1], 1, true);
      assert.equal(selected[0]?.id, publicQuestion);
      const fallback = await selectPracticeQuestions(userA, [5], 30, true);
      assert.equal(fallback.length, 30); assert.ok(fallback.slice(0, 10).every(q => questions.slice(20).includes(q.id)));
      assert.ok(!fallback.some(q => q.id === questionB));
    } finally { await prisma.question.delete({ where: { id: publicQuestion } }); }
  });
  it('reports legacy oversized attempts and capped history as partial instead of claiming complete coverage', async () => {
    await prisma.testAttempt.createMany({ data: Array.from({ length: 101 }, (_, i) => ({ userId: userC, testId: testB, score: 0, completedAt: date(i / 100) })) });
    const capped = await read.learningInsights(userC, now);
    assert.equal(capped.window.limited, true); assert.equal(capped.summary.attempts, 100);
    await prisma.testAttempt.deleteMany({ where: { userId: userC } });
    await prisma.testAttempt.create({ data: { userId: userC, testId: testB, score: 51, completedAt: date(1),
      userAnswers: { create: Array.from({ length: 51 }, () => ({ questionId: questionB, selectedOption: 'A', isCorrect: true })) } } });
    const oversized = await read.learningInsights(userC, now);
    assert.equal(oversized.window.limited, true); assert.equal(oversized.summary.answerEvents, 50); assert.equal(oversized.summary.uniqueQuestions, 1);
  });
  it('rejects a suspended account rather than returning its personal analytics', async () => {
    await prisma.user.update({ where: { id: userC }, data: { status: 'SUSPENDED' } });
    assert.equal((await route.GET(await request(userC))).status, 401);
  });
});
