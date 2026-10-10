export const MAX_INGESTION_PAGES = 4;
export const MAX_INGESTION_TEXT_CHARS = 30_000;
export const MAX_INGESTION_OCR_BYTES = 5 * 1024 * 1024;

export function isIngestionPaused() {
  return process.env.AI_ENABLED === "false" || process.env.INGESTION_ENABLED === "false";
}
