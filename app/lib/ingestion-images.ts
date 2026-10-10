import { extractionDraftSchema } from "@/app/lib/question-import";

export const MAX_INGESTION_IMAGES = 16;

export function ingestionImageIds(input: unknown) {
  const parsed = extractionDraftSchema.safeParse(input);
  return parsed.success ? [...new Set(parsed.data.data.flatMap(({ group }) => group?.imageAssetId ? [group.imageAssetId] : []))] : [];
}
