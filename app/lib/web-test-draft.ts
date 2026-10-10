import { z } from "zod";

const answersSchema = z.record(z.string().uuid(), z.enum(["A", "B", "C", "D"]));
const draftSchema = z.object({
  version: z.literal(1),
  clientSubmissionId: z.string().uuid(),
  answers: answersSchema,
  elapsed: z.number().int().min(0).max(86_400),
  currentIndex: z.number().int().min(0).max(49),
}).strict();

export type WebTestDraft = z.infer<typeof draftSchema>;

export function restoreWebTestDraft(
  raw: string | null,
  questions: Array<{ id: string; options: Record<string, string> }>,
  newSubmissionId: string,
): WebTestDraft {
  let parsed: unknown;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  const restored = draftSchema.safeParse(parsed);
  const legacy = answersSchema.safeParse(parsed);
  const draft: WebTestDraft = restored.success ? restored.data : {
    version: 1,
    clientSubmissionId: newSubmissionId,
    answers: legacy.success ? legacy.data : {},
    elapsed: 0,
    currentIndex: 0,
  };
  const allowed = new Map(questions.map((question) => [question.id, question.options]));
  return {
    ...draft,
    currentIndex: Math.min(draft.currentIndex, Math.max(0, questions.length - 1)),
    answers: Object.fromEntries(Object.entries(draft.answers).filter(([id, answer]) => {
      const options = allowed.get(id);
      return options && Object.hasOwn(options, answer);
    })),
  };
}
