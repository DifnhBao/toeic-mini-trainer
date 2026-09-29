import { prisma } from "@/app/lib/prisma";

export async function consumeDailyAiCall(userId: string, kind: "coach" | "explain" | "ingestion", maxPerDay: number) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${today}:${kind}:${userId}`;
  const usage = await prisma.userAiUsage.upsert({
    where: { key },
    create: { key, count: 1, expiresAt: new Date(Date.now() + 48 * 60 * 60_000) },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return usage.count <= maxPerDay;
}
