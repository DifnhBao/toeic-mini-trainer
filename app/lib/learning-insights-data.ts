import { Prisma } from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import { buildLearningInsights } from '@/app/lib/learning-insights';

export async function learningInsights(userId: string, now = new Date()) {
  // Consistent read, bounded result and strictly server-selected identity.
  const { attempts, availability } = await prisma.$transaction(async tx => {
    const attempts = await tx.testAttempt.findMany({
    where: { userId, score: { not: null }, completedAt: { gte: new Date(now.getTime() - 30 * 86400000), lte: now } },
    orderBy: [{ completedAt: 'desc' }, { id: 'desc' }], take: 101,
    select: { id: true, completedAt: true, userAnswers: { take: 51, orderBy: { id: 'asc' },
      select: { questionId: true, selectedOption: true, isCorrect: true,
        question: { select: { part: true, skillTags: { select: { skillTag: { select: { id: true, name: true } } } } } } } } },
    });
    // Same eligible publication/ownership predicate as selectPracticeQuestions.
    const availability = await tx.question.groupBy({ by: ['part'], _count: { id: true },
      where: { part: { gte: 1, lte: 7 }, OR: [
        { ownerId: null, publicationStatus: { in: ['LEGACY', 'PUBLISHED'] } },
        { ownerId: userId, publicationStatus: 'PRIVATE' },
      ] } });
    return { attempts, availability };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const selected = attempts.slice(0, 100);
  return buildLearningInsights(selected.map(a => ({ id: a.id, completedAt: a.completedAt,
    answers: a.userAnswers.slice(0, 50).map(answer => ({ questionId: answer.questionId, selectedOption: answer.selectedOption,
      isCorrect: answer.isCorrect, part: answer.question.part, skills: answer.question.skillTags.map(tag => tag.skillTag) })) })),
    now, attempts.length > 100 || selected.some(a => a.userAnswers.length > 50),
    Object.fromEntries(availability.map(row => [row.part, row._count.id])));
}
