import { prisma } from "@/app/lib/prisma";
import { createSharedRateLimiter, type RateLimitResult } from "@/app/lib/shared-rate-limit";
import { requestAddress } from "@/app/lib/request-address";

type RateBucket = {
  count: number;
  resetAt: number;
};

const globalRateLimit = globalThis as typeof globalThis & {
  mobileAuthRateBuckets?: Map<string, RateBucket>;
};

const buckets =
  globalRateLimit.mobileAuthRateBuckets ?? new Map<string, RateBucket>();

if (process.env.NODE_ENV !== "production") {
  globalRateLimit.mobileAuthRateBuckets = buckets;
}

const sharedLimiter = createSharedRateLimiter(async (key, expiresAt) => {
  const row = await prisma.userAiUsage.upsert({
    where: { key }, create: { key, count: 1, expiresAt },
    update: { count: { increment: 1 } }, select: { count: true },
  });
  return row.count;
});

export async function takeRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  // Authenticated scopes already contain a server-verified user ID. Changing
  // IP headers must not grant a fresh quota to that same user.
  const key = scope.includes(":") ? scope : `${scope}:${requestAddress(request)}`;
  if (process.env.NODE_ENV === "production" || process.env.RATE_LIMIT_STORE === "database") {
    return sharedLimiter(key, limit, windowMs);
  }
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;

  // Keep memory bounded in long-running development/server processes.
  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
