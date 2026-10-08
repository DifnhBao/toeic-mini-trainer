import { prisma } from "@/app/lib/prisma";

export async function consumeDailyAiCall(userId: string, kind: "coach" | "explain" | "ingestion", maxPerDay: number) {
  if (process.env.AI_ENABLED === "false" || (kind === "ingestion" && process.env.INGESTION_ENABLED === "false")) return false;
  const configuredMaximum = Number(process.env.AI_DAILY_GLOBAL_CALL_LIMIT ?? "200");
  if (!Number.isSafeInteger(configuredMaximum) || configuredMaximum < 1) return false;
  const today = new Date().toISOString().slice(0, 10);
  const key = `${today}:${kind}:${userId}`;
  const usage = await prisma.userAiUsage.upsert({
    where: { key },
    create: { key, count: 1, expiresAt: new Date(Date.now() + 48 * 60 * 60_000) },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  if (usage.count > maxPerDay) return false;
  // Ingestion quota counts jobs; reserve provider quota inside the worker so
  // retries are counted too and rejected files do not consume provider calls.
  if (kind === "ingestion") return true;
  return consumeGlobalAiCall();
}

export async function consumeGlobalAiCall() {
  if (process.env.AI_ENABLED === "false") return false;
  const configuredMaximum = Number(process.env.AI_DAILY_GLOBAL_CALL_LIMIT ?? "200");
  if (!Number.isSafeInteger(configuredMaximum) || configuredMaximum < 1) return false;
  const today = new Date().toISOString().slice(0, 10);
  const globalUsage = await prisma.userAiUsage.upsert({
    where: { key: `${today}:global:ai` },
    create: { key: `${today}:global:ai`, count: 1, expiresAt: new Date(Date.now() + 48 * 60 * 60_000) },
    update: { count: { increment: 1 } }, select: { count: true },
  });
  return globalUsage.count <= configuredMaximum;
}
