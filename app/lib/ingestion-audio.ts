import { extractionDraftSchema } from "@/app/lib/question-import";

export const MAX_INGESTION_AUDIO = 64;

export function ingestionAudioIds(input: unknown) {
  const parsed = extractionDraftSchema.safeParse(input);
  return parsed.success ? [...new Set(parsed.data.data.flatMap(({ group }) => group?.audioAssetId ? [group.audioAssetId] : []))] : [];
}

// Legacy tasks use only the original audio. New tasks can register a distinct
// clip on each group; accepting a submitted ID still requires owner/kind/READY.
export function allowedIngestionAudioIds(input: unknown, sourceAudioId: string | null) {
  return new Set([...ingestionAudioIds(input), ...(sourceAudioId ? [sourceAudioId] : [])]);
}
