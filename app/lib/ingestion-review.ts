import { z } from "zod";
import { extractedDataSchema, type ExtractedData } from "@/app/lib/question-import";

const locationSchema = {
  groupIndex: z.number().int().min(0).max(249),
  questionIndex: z.number().int().min(0).max(99),
};

const reviewSchema = z.discriminatedUnion("decision", [
  z.object({ ...locationSchema, decision: z.literal("APPROVE"), question: z.unknown() }).strict(),
  z.object({ ...locationSchema, decision: z.literal("SKIP") }).strict(),
]);

export const reviewPayloadSchema = z.object({ reviews: z.array(reviewSchema).min(1).max(500) }).strict();

// Compatibility for installed APKs only. Any supplied body, including an
// invalid one, must be validated rather than falling back to the AI result.
export function requiresQuestionReview(request: Request) {
  return !request.headers.get("authorization")?.startsWith("Bearer ") || request.body !== null;
}

export class InvalidIngestionReviewError extends Error {
  constructor() {
    super("Hãy duyệt hoặc bỏ qua từng câu và kiểm tra nội dung, phương án, đáp án trước khi lưu.");
    this.name = "InvalidIngestionReviewError";
  }
}

export function buildReviewedImport(source: unknown, input: unknown): ExtractedData {
  const original = extractedDataSchema.parse(source);
  const parsed = reviewPayloadSchema.safeParse(input);
  if (!parsed.success) throw new InvalidIngestionReviewError();

  const total = original.data.reduce((sum, group) => sum + group.questions.length, 0);
  if (parsed.data.reviews.length !== total) throw new InvalidIngestionReviewError();

  const decisions = new Map<string, (typeof parsed.data.reviews)[number]>();
  for (const review of parsed.data.reviews) {
    if (!original.data[review.groupIndex]?.questions[review.questionIndex]) {
      throw new InvalidIngestionReviewError();
    }
    const key = `${review.groupIndex}:${review.questionIndex}`;
    if (decisions.has(key)) throw new InvalidIngestionReviewError();
    decisions.set(key, review);
  }

  const data = original.data.flatMap((group, groupIndex) => {
    const questions: unknown[] = [];
    group.questions.forEach((_question, questionIndex) => {
      const review = decisions.get(`${groupIndex}:${questionIndex}`);
      if (!review) throw new InvalidIngestionReviewError();
      if (review.decision === "APPROVE") questions.push(review.question);
    });
    return questions.length ? [{ group: group.group, questions }] : [];
  });
  if (!data.length) throw new InvalidIngestionReviewError();

  const reviewed = extractedDataSchema.safeParse({ data });
  if (!reviewed.success) throw new InvalidIngestionReviewError();
  if (reviewed.data.data.some((group) => group.questions.some((question) =>
    question.part >= 3 && !question.content?.trim()))) {
    throw new InvalidIngestionReviewError();
  }
  return reviewed.data;
}
