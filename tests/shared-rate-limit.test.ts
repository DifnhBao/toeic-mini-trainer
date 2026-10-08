import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createSharedRateLimiter } from "../app/lib/shared-rate-limit";
import { requestAddress } from "../app/lib/request-address";

describe("shared fixed-window limits", () => {
  it("shares one allowance across two API instances under concurrent traffic", async () => {
    const counts = new Map<string, number>();
    const increment = async (key: string) => {
      const count = (counts.get(key) ?? 0) + 1; counts.set(key, count); return count;
    };
    const a = createSharedRateLimiter(increment, () => 1_005);
    const b = createSharedRateLimiter(increment, () => 1_005);
    const results = await Promise.all(Array.from({ length: 25 }, (_, index) =>
      (index % 2 ? a : b)("test-submit:user-1", 10, 60_000)));
    assert.equal(results.filter((result) => result.allowed).length, 10);
    assert.equal(counts.size, 1);
    assert.equal(results.at(-1)?.retryAfterSeconds, 59);
  });
  it("resets at a new window and keeps user identities separate", async () => {
    let now = 1;
    const counts = new Map<string, number>();
    const limiter = createSharedRateLimiter(async (key) => {
      const count = (counts.get(key) ?? 0) + 1; counts.set(key, count); return count;
    }, () => now);
    assert.equal((await limiter("scope:user-1", 1, 100)).allowed, true);
    assert.equal((await limiter("scope:user-1", 1, 100)).allowed, false);
    assert.equal((await limiter("scope:user-2", 1, 100)).allowed, true);
    now = 100;
    assert.equal((await limiter("scope:user-1", 1, 100)).allowed, true);
    assert.ok([...counts.keys()].every((key) => !key.includes("user-")));
  });
  it("fails closed when the shared counter is unavailable", async () => {
    const limiter = createSharedRateLimiter(async () => { throw new Error("offline"); });
    assert.deepEqual(await limiter("scope:user", 10, 60_000), { allowed: false, retryAfterSeconds: 5, unavailable: true });
  });
});

describe("trusted request address", () => {
  const prior = { VERCEL: process.env.VERCEL, NODE_ENV: process.env.NODE_ENV, TRUSTED_CLIENT_IP_HEADER: process.env.TRUSTED_CLIENT_IP_HEADER };
  afterEach(() => {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  it("uses the Vercel edge header even if x-real-ip changes", () => {
    process.env.VERCEL = "1";
    const request = new Request("https://test.invalid", { headers: { "x-forwarded-for": "203.0.113.1", "x-real-ip": "198.51.100.1" } });
    assert.equal(requestAddress(request), "203.0.113.1");
  });
  it("ignores arbitrary headers in production without a trusted proxy", () => {
    delete process.env.VERCEL; delete process.env.TRUSTED_CLIENT_IP_HEADER;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    assert.equal(requestAddress(new Request("https://test.invalid", { headers: { "x-real-ip": "198.51.100.1", "x-forwarded-for": "203.0.113.1" } })), "unknown");
  });
});
