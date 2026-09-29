import { z } from "zod";
import { extractedDataSchema } from "@/app/lib/question-import";

// A shared contribution may reference only validated private assets, never
// legacy paths that might expose uploaded source material to other users.
export const sharedQuestionDataSchema = extractedDataSchema.refine(
  (value) => value.data.every(({ group }) => !group?.audioUrl && !group?.imageUrl),
  "Legacy media paths cannot be published",
);

export const submitContributionSchema = z.object({
  jobId: z.string().uuid(),
  data: sharedQuestionDataSchema,
  rightsConfirmed: z.literal(true),
}).strict();

export const reviewContributionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("APPROVE"), note: z.string().trim().max(1_000).optional() }).strict(),
  z.object({ decision: z.literal("REJECT"), note: z.string().trim().min(5).max(1_000) }).strict(),
]);

export function contributionQuestionCount(data: z.infer<typeof sharedQuestionDataSchema>) {
  return data.data.reduce((total, group) => total + group.questions.length, 0);
}
