import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { GenerateContentConfig } from "@google/genai";
import { prisma } from "@/app/lib/prisma";

export const AI_LEASE_PREFIX = "ai:lease:v1:";
const LEASE_GRACE_MS = 30_000;

export class AiCapacityError extends Error {
  constructor(public readonly code: "AI_BUSY" | "AI_CAPACITY_UNAVAILABLE", public readonly retryAfterSeconds = 5) {
    super(code); this.name = "AiCapacityError";
  }
}
export class AiQuotaExceededError extends Error {
  constructor() { super("AI_DAILY_LIMIT"); this.name = "AiQuotaExceededError"; }
}

// The lock is transaction-scoped so it also works behind transaction poolers.
// It is never held during a provider request. Expiry uses the database clock.
export async function acquireAiProviderLease(timeoutMs: number, database: PrismaClient = prisma) {
  const maximum = Number(process.env.AI_MAX_CONCURRENT_CALLS ?? "3");
  if (process.env.AI_ENABLED === "false" || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 20
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 240_000) {
    throw new AiCapacityError("AI_CAPACITY_UNAVAILABLE");
  }
  const key = `${AI_LEASE_PREFIX}${randomUUID()}`;
  try {
    await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL lock_timeout = '1s'`;
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(18887, 1)`;
      await transaction.$executeRaw`DELETE FROM user_ai_usage WHERE key LIKE 'ai:lease:v1:%' AND "expiresAt" <= clock_timestamp()`;
      const [capacity] = await transaction.$queryRaw<Array<{ active: number; retryAfterSeconds: number }>>`
        SELECT count(*)::int AS active,
          COALESCE(GREATEST(1, ceil(extract(epoch FROM min("expiresAt") - clock_timestamp())))::int, 5) AS "retryAfterSeconds"
        FROM user_ai_usage WHERE key LIKE 'ai:lease:v1:%' AND "expiresAt" > clock_timestamp()
      `;
      if (capacity.active >= maximum) throw new AiCapacityError("AI_BUSY", capacity.retryAfterSeconds);
      await transaction.$executeRaw`
        INSERT INTO user_ai_usage (key, count, "expiresAt")
        VALUES (${key}, 1, clock_timestamp() + ${timeoutMs + LEASE_GRACE_MS} * interval '1 millisecond')
      `;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2_000, timeout: 5_000 });
  } catch (error) {
    if (error instanceof AiCapacityError) throw error;
    console.error("ai.capacity.acquire.failed", { errorType: error instanceof Error ? error.name : "unknown" });
    throw new AiCapacityError("AI_CAPACITY_UNAVAILABLE");
  }
  return {
    key,
    async release() {
      // A late release only removes its own UUID, never a replacement lease.
      try { await database.userAiUsage.deleteMany({ where: { key } }); }
      catch (error) {
        console.error("ai.capacity.release.failed", { errorType: error instanceof Error ? error.name : "unknown" });
        // Keep the lease until expiry; a completed answer must not be discarded.
      }
    },
  };
}

type ProviderConfig = Pick<GenerateContentConfig, "abortSignal" | "httpOptions">;
export async function withAiProviderCapacity<T>(options: {
  timeoutMs: number;
  allow: () => Promise<boolean>;
  generate: (config: ProviderConfig) => Promise<T>;
}, database: PrismaClient = prisma): Promise<T> {
  const lease = await acquireAiProviderLease(options.timeoutMs, database);
  let providerStarted = false;
  let completed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort(); reject(new DOMException("AI request timed out", "TimeoutError"));
      }, options.timeoutMs);
    });
    // Include the quota lookup in the deadline: a stalled database must not
    // start a provider request after the permit has expired.
    if (!(await Promise.race([options.allow(), expired]))) throw new AiQuotaExceededError();
    providerStarted = true;
    const result = await Promise.race([
      options.generate({ abortSignal: controller.signal, httpOptions: { timeout: options.timeoutMs, retryOptions: { attempts: 1 } } }),
      expired,
    ]);
    completed = true;
    return result;
  } finally {
    if (timer) clearTimeout(timer);
    // Cancellation is client-only in Gemini. Keep uncertain/failed requests
    // reserved until timeout + grace; the provider may still be processing.
    if (!providerStarted || completed) await lease.release();
  }
}
