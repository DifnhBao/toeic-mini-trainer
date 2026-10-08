import { createHash } from "node:crypto";

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  unavailable?: boolean;
};

type Counter = (key: string, expiresAt: Date) => Promise<number>;

// One atomic DB upsert is the shared counter. A fixed window is explicit so
// every API instance agrees on the same key and reset time.
export function createSharedRateLimiter(increment: Counter, clock = Date.now) {
  return async (identity: string, maximum: number, windowMs: number): Promise<RateLimitResult> => {
    const now = clock();
    const start = Math.floor(now / windowMs) * windowMs;
    const resetAt = start + windowMs;
    const key = `rate:v1:${start}:${windowMs}:${createHash("sha256").update(identity).digest("hex")}`;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
    try {
      const count = await increment(key, new Date(resetAt + 60_000));
      return { allowed: count <= maximum, retryAfterSeconds: count <= maximum ? 0 : retryAfterSeconds };
    } catch {
      return { allowed: false, retryAfterSeconds: 5, unavailable: true };
    }
  };
}
