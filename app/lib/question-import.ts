import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { sanitizePassageHtml } from "@/app/lib/passage-html";

const legacyMediaUrl = z
  .string()
  .trim()
  .max(2_048)
  .refine((value) => value.startsWith("/uploads/"), "Only legacy local media paths are accepted");

const optionsSchema = z
  .record(z.string().regex(/^[A-D]$/), z.string().trim().min(1).max(4_000))
  .refine((options) => {
    const optionCount = Object.keys(options).length;
    return optionCount >= 2 && optionCount <= 4;
  }, "Each question must have between 2 and 4 options");

const questionFields = {
  part: z.number().int().min(1).max(7),
  content: z.string().trim().max(10_000).nullable().optional(),
  options: optionsSchema,
  correctAnswer: z.string().trim().toUpperCase().regex(/^[A-D]$/),
};
const questionSchema = z
  .object(questionFields)
  .strict()
  .refine((question) => question.correctAnswer in question.options, {
    message: "The correct answer must exist in options",
  });

const draftQuestionSchema = z.object({
  ...questionFields,
  correctAnswer: z.string().trim().toUpperCase().regex(/^(?:[A-D])?$/),
}).strict().refine((question) => !question.correctAnswer || question.correctAnswer in question.options, {
  message: "A known draft answer must exist in options",
});

const groupSchema = z
  .object({
    groupType: z.enum(["AUDIO", "TEXT", "MIXED"]).default("TEXT"),
    passageText: z.string().max(50_000).transform(sanitizePassageHtml).nullable().optional(),
    audioUrl: legacyMediaUrl.nullable().optional(),
    imageUrl: legacyMediaUrl.nullable().optional(),
    audioAssetId: z.string().uuid().nullable().optional(),
    imageAssetId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const extractedDataSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            group: groupSchema.nullable().optional(),
            questions: z.array(questionSchema).min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(250),
  })
  .strict()
  .refine((value) => value.data.reduce((sum, item) => sum + item.questions.length, 0) <= 500, {
    message: "A single import cannot exceed 500 questions",
  });

// An AI draft can lack an answer key. Persistence and publication continue to
// use extractedDataSchema, so an unresolved draft cannot become a question.
export const extractionDraftSchema = extractedDataSchema.safeExtend({
  data: z.array(z.object({
    group: groupSchema.nullable().optional(),
    questions: z.array(draftQuestionSchema).min(1).max(100),
  }).strict()).min(1).max(250),
});

export const generatedQuestionsSchema = extractionDraftSchema.superRefine((value, context) => {
  value.data.forEach((group, groupIndex) => group.questions.forEach((question, questionIndex) => {
    const expected = question.part === 2 ? ["A", "B", "C"] : ["A", "B", "C", "D"];
    if (Object.keys(question.options).length !== expected.length || expected.some(key => !question.options[key])) {
      context.addIssue({ code: "custom", path: ["data", groupIndex, "questions", questionIndex, "options"], message: "Generated options must match the TOEIC Part" });
    }
  }));
});

export type ExtractedData = z.infer<typeof extractedDataSchema>;

export async function importExtractedQuestions(
  ownerId: string,
  input: unknown,
  finalize?: (tx: Prisma.TransactionClient, questionsAdded: number) => Promise<void>,
  sharedContributionId?: string,
  sharedAsset?: Prisma.UploadedAssetUncheckedCreateInput & { id: string },
) {
  const parsed = extractedDataSchema.parse(input);
  const assetIds = new Set<string>();
  for (const item of parsed.data) {
    if (item.group?.audioAssetId) assetIds.add(item.group.audioAssetId);
    if (item.group?.imageAssetId) assetIds.add(item.group.imageAssetId);
  }
  if (sharedContributionId && assetIds.size > 0 && !sharedAsset) {
    throw new Error("SHARED_ASSET_REQUIRED");
  }
  if (sharedAsset) {
    if (!sharedContributionId || sharedAsset.kind !== "AUDIO" || sharedAsset.ownerId !== null ||
      !assetIds.has(sharedAsset.id)) {
      throw new Error("SHARED_ASSET_INVALID");
    }
    assetIds.delete(sharedAsset.id);
  }
  if (sharedContributionId && assetIds.size > 0) throw new Error("SHARED_ASSET_INVALID");

  if (assetIds.size > 0) {
    const ownedAssets = await prisma.uploadedAsset.findMany({
      where: { id: { in: [...assetIds] }, ownerId, status: "READY" },
      select: { id: true },
    });
    if (ownedAssets.length !== assetIds.size) {
      throw new Error("ASSET_OWNERSHIP_INVALID");
    }
  }

  return prisma.$transaction(
    async (tx) => {
      if (sharedAsset) await tx.uploadedAsset.create({ data: sharedAsset });
      let questionsAdded = 0;
      for (const item of parsed.data) {
        let groupId: string | null = null;
        if (item.group) {
          const group = await tx.questionGroup.create({
            data: {
              ownerId: sharedContributionId ? null : ownerId,
              contributionId: sharedContributionId || null,
              groupType: item.group.groupType,
              passageText: item.group.passageText || null,
              audioUrl: item.group.audioUrl || null,
              imageUrl: item.group.imageUrl || null,
              audioAssetId: item.group.audioAssetId || null,
              imageAssetId: item.group.imageAssetId || null,
            },
          });
          groupId = group.id;
        }

        for (const question of item.questions) {
          await tx.question.create({
            data: {
              ownerId: sharedContributionId ? null : ownerId,
              contributionId: sharedContributionId || null,
              publicationStatus: sharedContributionId ? "PUBLISHED" : "PRIVATE",
              groupId,
              part: question.part,
              content: question.content || null,
              options: question.options,
              correctAnswer: question.correctAnswer,
            },
          });
          questionsAdded += 1;
        }
      }
      if (finalize) await finalize(tx, questionsAdded);
      return questionsAdded;
    },
    { maxWait: 5_000, timeout: 20_000 },
  );
}
