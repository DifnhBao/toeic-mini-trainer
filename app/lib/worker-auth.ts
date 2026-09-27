import { createHash, timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 32;

export function isIngestionWorkerConfigured(
  secret: string | undefined = process.env.INGESTION_WORKER_SECRET,
): secret is string {
  return typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH;
}

export function isAuthorizedIngestionWorker(
  authorization: string | null,
  secret = process.env.INGESTION_WORKER_SECRET,
) {
  if (!isIngestionWorkerConfigured(secret) || !authorization?.startsWith("Bearer ")) {
    return false;
  }

  const supplied = authorization.slice("Bearer ".length);
  if (!supplied || supplied.includes(" ")) return false;

  const expectedHash = createHash("sha256").update(secret).digest();
  const suppliedHash = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}
