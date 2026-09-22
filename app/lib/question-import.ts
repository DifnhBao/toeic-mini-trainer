import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";

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

const questionSchema = z
  .object({
    part: z.number().int().min(1).max(7),
    content: z.string().trim().max(10_000).nullable().optional(),
    options: optionsSchema,
    correctAnswer: z.string().trim().toUpperCase().regex(/^[A-D]$/),
  })
  .strict()
  .refine((question) => question.correctAnswer in question.options, {
    message: "The correct answer must exist in options",
  });

const groupSchema = z
  .object({
    groupType: z.enum(["AUDIO", "TEXT", "MIXED"]).default("TEXT"),
    passageText: z.string().max(50_000).nullable().optional(),
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

export type ExtractedData = z.infer<typeof extractedDataSchema>;

export async function importExtractedQuestions(
  ownerId: string,
  input: unknown,
  finalize?: (tx: Prisma.TransactionClient, questionsAdded: number) => Promise<void>,
) {
  const parsed = extractedDataSchema.parse(input);
  const assetIds = new Set<string>();
  for (const item of parsed.data) {
    if (item.group?.audioAssetId) assetIds.add(item.group.audioAssetId);
    if (item.group?.imageAssetId) assetIds.add(item.group.imageAssetId);
  }

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
      let questionsAdded = 0;
      for (const item of parsed.data) {
        let groupId: string | null = null;
        if (item.group) {
          const group = await tx.questionGroup.create({
            data: {
              ownerId,
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
              ownerId,
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
