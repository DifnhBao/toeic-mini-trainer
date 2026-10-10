// Answer row IDs are unrelated to the order in which questions were shown.
// Keep unmatched legacy answers after known questions in their existing order.
export function orderAttemptAnswers<T extends { question: { id: string } }>(
  answers: readonly T[],
  questions: readonly { questionId: string; orderIndex: number }[],
): T[] {
  const positions = new Map(questions.map(question => [question.questionId, question.orderIndex]));
  return [...answers].sort((a, b) =>
    (positions.get(a.question.id) ?? Number.MAX_SAFE_INTEGER) -
    (positions.get(b.question.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
