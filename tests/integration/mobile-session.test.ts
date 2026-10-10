import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") throw new Error("Explicit isolated integration database required");
const target = new URL(testUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.pathname !== "/toeic_release_test" || target.searchParams.get("sslmode") !== "disable" || [...target.searchParams.keys()].some(key => key !== "sslmode") || process.env.NODE_ENV === "production") throw new Error("Only isolated local toeic_release_test with sslmode=disable accepted");
process.env.DATABASE_URL = testUrl;
process.env.MOBILE_JWT_SECRET = "mobile-session-integration-secret-never-deployed";
const runId = randomUUID(), owner = randomUUID(), deviceId = "synthetic-mobile-device";
const revokerName = `session-revoker-${runId}`;
const clients = ["rotation", revokerName].map(application_name => new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: testUrl, max: 3, application_name })),
  transactionOptions: { timeout: 10_000 },
}));
let auth: typeof import("../../app/lib/mobile-auth");
let root: PrismaClient;
let logout: typeof import("../../app/api/v1/auth/logout/route");
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
before(async () => {
  root = (await import("../../app/lib/prisma")).prisma;
  auth = await import("../../app/lib/mobile-auth");
  logout = await import("../../app/api/v1/auth/logout/route");
  await root.user.create({ data: { id: owner, email: `${owner}@session-race.invalid` } });
});
after(async () => {
  if (root) { await root.user.deleteMany({ where: { id: owner } }); await root.$disconnect(); }
  await Promise.all(clients.map(client => client.$disconnect()));
});
async function waitForRevokerLock() {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const [row] = await clients[0].$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name = ${revokerName} AND wait_event_type = 'Lock') AS waiting`;
    if (row.waiting) return;
    await delay(10);
  }
  assert.fail("Revoker did not reach the controlled database lock");
}

describe("refresh family concurrency on independent PostgreSQL connections", () => {
  for (const reuse of [false, true]) {
    it(`revokes the replacement committed while ${reuse ? "old-token reuse" : "logout"} waits`, async () => {
      const initial = await auth.createMobileSession(owner, deviceId);
      const current = reuse ? await auth.rotateRefreshToken(initial.refreshToken, deviceId, clients[0]) : initial;
      assert.ok(current);
      const inserted = deferred<void>(), release = deferred<void>();
      // Keep the real rotation transaction open after INSERT, then start a
      // real logout/reuse on another connection. No timing-only race or fake DB.
      const paused = clients[0].$extends({ query: { mobileSession: { async create({ args, query }) {
        const value = await query(args); inserted.resolve(); await release.promise; return value;
      } } } }) as unknown as PrismaClient;
      const rotation = auth.rotateRefreshToken(current.refreshToken, deviceId, paused);
      let revocation: Promise<unknown> | undefined;
      let replacement: Awaited<ReturnType<typeof auth.rotateRefreshToken>> = null;
      try {
        await inserted.promise;
        revocation = reuse ? auth.rotateRefreshToken(initial.refreshToken, deviceId, clients[1]) : auth.revokeRefreshToken(initial.refreshToken, clients[1]);
        await waitForRevokerLock(); release.resolve();
        replacement = await rotation; assert.ok(replacement);
        const value = await revocation;
        if (reuse) assert.equal(value, null);
        const initialRow = await root.mobileSession.findUniqueOrThrow({ where: { tokenHash: createHash("sha256").update(initial.refreshToken).digest("hex") } });
        assert.equal(await root.mobileSession.count({ where: { familyId: initialRow.familyId, revokedAt: null } }), 0);
        assert.equal(await auth.rotateRefreshToken(replacement.refreshToken, deviceId, clients[0]), null);
      } finally { release.resolve(); await Promise.allSettled([rotation, ...(revocation ? [revocation] : [])]); }
    });
  }
  it("allows one rotation under twenty simultaneous retries and revokes the family on reuse", async () => {
    const initial = await auth.createMobileSession(owner, deviceId);
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => auth.rotateRefreshToken(initial.refreshToken, deviceId, clients[index % 2])));
    const successes = results.filter(result => result !== null);
    assert.equal(successes.length, 1);
    assert.equal(await auth.rotateRefreshToken(successes[0]!.refreshToken, deviceId, clients[0]), null);
  });
  it("revokes only one device family and keeps logout idempotent", async () => {
    const first = await auth.createMobileSession(owner, deviceId);
    const second = await auth.createMobileSession(owner, "another-synthetic-device");
    await auth.revokeRefreshToken(first.refreshToken, clients[1]);
    await auth.revokeRefreshToken(first.refreshToken, clients[0]);
    await auth.revokeRefreshToken("nonexistent-synthetic-token", clients[1]);
    assert.equal(await auth.rotateRefreshToken(first.refreshToken, deviceId, clients[0]), null);
    assert.ok(await auth.rotateRefreshToken(second.refreshToken, "another-synthetic-device", clients[0]));
  });
  it("does not rotate for a wrong device or an expired token", async () => {
    const initial = await auth.createMobileSession(owner, deviceId);
    assert.equal(await auth.rotateRefreshToken(initial.refreshToken, "wrong-device", clients[0]), null);
    const replacement = await auth.rotateRefreshToken(initial.refreshToken, deviceId, clients[0]); assert.ok(replacement);
    const tokenHash = createHash("sha256").update(replacement.refreshToken).digest("hex");
    await root.mobileSession.update({ where: { tokenHash }, data: { expiresAt: new Date(0) } });
    assert.equal(await auth.rotateRefreshToken(replacement.refreshToken, deviceId, clients[0]), null);
    assert.equal((await root.mobileSession.findUniqueOrThrow({ where: { tokenHash } })).revokedAt, null);
  });
  it("preserves the client's token when JWT signing configuration fails", async () => {
    const initial = await auth.createMobileSession(owner, deviceId);
    const prior = process.env.MOBILE_JWT_SECRET;
    process.env.MOBILE_JWT_SECRET = "too-short";
    try { await assert.rejects(auth.rotateRefreshToken(initial.refreshToken, deviceId, clients[0]), /MOBILE_JWT_SECRET/); }
    finally { process.env.MOBILE_JWT_SECRET = prior; }
    const row = await root.mobileSession.findUniqueOrThrow({ where: { tokenHash: createHash("sha256").update(initial.refreshToken).digest("hex") } });
    assert.equal(row.revokedAt, null); assert.equal(row.replacedById, null);
    assert.equal(await root.mobileSession.count({ where: { familyId: row.familyId } }), 1);
    assert.ok(await auth.rotateRefreshToken(initial.refreshToken, deviceId, clients[0]));
  });
  it("rolls back revocation if storing the replacement fails", async () => {
    const initial = await auth.createMobileSession(owner, deviceId);
    const failing = clients[0].$extends({ query: { mobileSession: { async create() { throw new Error("Synthetic insert failure"); } } } }) as unknown as PrismaClient;
    await assert.rejects(auth.rotateRefreshToken(initial.refreshToken, deviceId, failing), /Synthetic insert failure/);
    const row = await root.mobileSession.findUniqueOrThrow({ where: { tokenHash: createHash("sha256").update(initial.refreshToken).digest("hex") } });
    assert.equal(row.revokedAt, null); assert.equal(row.replacedById, null);
    assert.equal(await root.mobileSession.count({ where: { familyId: row.familyId } }), 1);
    assert.ok(await auth.rotateRefreshToken(initial.refreshToken, deviceId, clients[0]));
  });
  it("returns 503 when logout cannot confirm server revocation", async () => {
    const original = root.mobileSession.findUnique;
    const priorStore = process.env.RATE_LIMIT_STORE;
    process.env.RATE_LIMIT_STORE = "memory";
    root.mobileSession.findUnique = () => { throw new Error("Synthetic database outage"); };
    try {
      const response = await logout.POST(new Request("https://integration.invalid/api/v1/auth/logout", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: "A".repeat(64) }),
      }));
      assert.equal(response.status, 503);
      const body = await response.json(); assert.equal(body.error.code, "AUTH_UNAVAILABLE");
      assert.ok(!JSON.stringify(body).includes("Synthetic database outage"));
    } finally {
      root.mobileSession.findUnique = original;
      if (priorStore === undefined) delete process.env.RATE_LIMIT_STORE; else process.env.RATE_LIMIT_STORE = priorStore;
    }
  });
  it("returns the same logout response for a known, repeated or unknown token", async () => {
    const initial = await auth.createMobileSession(owner, deviceId);
    const priorStore = process.env.RATE_LIMIT_STORE; process.env.RATE_LIMIT_STORE = "memory";
    try {
      for (const refreshToken of [initial.refreshToken, initial.refreshToken, "B".repeat(64)]) {
        const response = await logout.POST(new Request("https://integration.invalid/api/v1/auth/logout", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken }),
        }));
        assert.equal(response.status, 200); assert.deepEqual(await response.json(), { success: true });
      }
      assert.equal(await auth.rotateRefreshToken(initial.refreshToken, deviceId, clients[0]), null);
    } finally { if (priorStore === undefined) delete process.env.RATE_LIMIT_STORE; else process.env.RATE_LIMIT_STORE = priorStore; }
  });
});
