import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { before, beforeEach, afterEach, after, describe, it, mock } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { SignJWT } from "jose";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") throw new Error("Explicit isolated database required");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.pathname !== "/toeic_release_test" || process.env.NODE_ENV === "production") throw new Error("Only isolated local toeic_release_test accepted");
process.env.DATABASE_URL = databaseUrl;
process.env.MOBILE_JWT_SECRET = "integration-only-explanation-cache-secret";
process.env.GUEST_TEST_SECRET = "integration-only-explanation-guest-secret";
process.env.GEMINI_API_KEY = "integration-placeholder-no-network-provider";
process.env.AI_ENABLED = "true";
process.env.AI_MAX_CONCURRENT_CALLS = "3";
process.env.AI_DAILY_GLOBAL_CALL_LIMIT = "200";
process.env.RATE_LIMIT_STORE = "database";
const learner = randomUUID(), other = randomUUID(), admin = randomUUID();
const questions: string[] = [], tests: string[] = [];
let prisma: PrismaClient;
let explain: typeof import("../../app/api/v1/ai/explain/route");
let hide: typeof import("../../app/api/v1/admin/questions/[id]/explanation/hide/route");
let history: typeof import("../../app/api/v1/attempts/[id]/route");
let guest: typeof import("../../app/api/v1/guest/tests/submit/route");
let guestChallenge: typeof import("../../app/lib/guest-tests");
let initialUsage: Array<{ key: string; count: number; expiresAt: Date }>;
let providerCalls = 0;
let providerReply: (index: number) => Promise<Response>;
let afterCacheRead: (() => Promise<void>) | undefined;
const inFlight: Array<Promise<Response>> = [];
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
type Gate = { started: Deferred<void>; result: Deferred<Response> };
const gates: Gate[] = [];
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const canonical = (marker: string) => ({ correctReason: marker, optionA: "", optionB: "B reason", optionC: "C reason", optionD: "D reason", memoryTip: "Check the subject." });
const providerResponse = (marker = "fixture current") => new Response(JSON.stringify({
  candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(canonical(marker)) }] }, finishReason: "STOP" }],
}), { headers: { "content-type": "application/json" } });
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function gate(): Gate {
  const started = deferred<void>(), result = deferred<Response>();
  const value = { started, result }; gates.push(value); return value;
}
before(async () => {
  // A query extension controls one race boundary while retaining real SQL.
  // Install it before app imports so handlers share this isolated client.
  const database = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: databaseUrl, max: 4 })) });
  (globalThis as typeof globalThis & { prisma: PrismaClient }).prisma = database.$extends({ query: {
    questionExplanationCache: { async findUnique({ args, query }) {
      const snapshot = await query(args);
      if (afterCacheRead) await afterCacheRead();
      return snapshot;
    } },
  } }) as unknown as PrismaClient;
  prisma = (await import("../../app/lib/prisma")).prisma;
  explain = await import("../../app/api/v1/ai/explain/route");
  hide = await import("../../app/api/v1/admin/questions/[id]/explanation/hide/route");
  history = await import("../../app/api/v1/attempts/[id]/route");
  guest = await import("../../app/api/v1/guest/tests/submit/route");
  guestChallenge = await import("../../app/lib/guest-tests");
  initialUsage = await prisma.userAiUsage.findMany({ select: { key: true, count: true, expiresAt: true } });
  await prisma.user.createMany({ data: [{ id: learner, role: "USER" as const }, { id: other, role: "USER" as const }, { id: admin, role: "ADMIN" as const }].map(user => ({ ...user, email: `${user.id}@test.invalid` })) });
});
beforeEach(async () => {
  providerCalls = 0;
  providerReply = async () => providerResponse();
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, "https://generativelanguage.googleapis.com", "Unexpected network request blocked");
    assert.match(url.pathname, /:generateContent$/);
    return providerReply(providerCalls++);
  });
  await prisma.userAiUsage.deleteMany({ where: { OR: [learner, other].flatMap(id => [
    { key: { endsWith: `:explain:${id}` } },
    { key: { endsWith: createHash("sha256").update(`mobile-ai-explain:${id}`).digest("hex") } },
  ]) } });
});
afterEach(async () => {
  afterCacheRead = undefined;
  for (const value of gates.splice(0)) value.result.resolve(providerResponse("fixture cleanup"));
  await Promise.allSettled(inFlight.splice(0));
  mock.restoreAll();
  // A failed provider request intentionally keeps its lease until expiry.
  // Remove only keys created by this test file in the isolated DB.
  const initialKeys = new Set(initialUsage.map(row => row.key));
  const keys = (await prisma.userAiUsage.findMany({ select: { key: true } })).map(row => row.key).filter(key => !initialKeys.has(key));
  await prisma.userAiUsage.deleteMany({ where: { key: { in: keys } } });
});
after(async () => {
  if (!prisma) return;
  await prisma.authorizationAuditEvent.deleteMany({ where: { actorId: admin } });
  await prisma.miniTest.deleteMany({ where: { id: { in: tests } } });
  await prisma.question.deleteMany({ where: { id: { in: questions } } });
  await prisma.user.deleteMany({ where: { id: { in: [learner, other, admin] } } });
  for (const row of initialUsage.filter(row => row.key.endsWith(":global:ai"))) await prisma.userAiUsage.update({ where: { key: row.key }, data: { count: row.count, expiresAt: row.expiresAt } });
  await prisma.$disconnect();
});
async function request(user: string, body?: unknown) {
  const token = await new SignJWT({ tokenUse: "access" }).setProtectedHeader({ alg: "HS256" }).setSubject(user)
    .setIssuer("toeic-mini-trainer").setAudience("toeic-mobile").setExpirationTime("5m")
    .sign(new TextEncoder().encode(process.env.MOBILE_JWT_SECRET));
  return new Request("https://integration.invalid/explain", { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function fixture() {
  const question = randomUUID(); questions.push(question);
  await prisma.question.create({ data: { id: question, ownerId: null, publicationStatus: "PUBLISHED", part: 5, content: "The sample ___ ready.", options: { A: "is", B: "are", C: "be", D: "being" }, correctAnswer: "A" } });
  const attempts: Array<{ id: string; answer: string }> = [];
  for (const [index, user] of [learner, other].entries()) {
    const test = randomUUID(); tests.push(test);
    await prisma.miniTest.create({ data: { id: test, createdById: user, title: "Explanation fixture", questions: { create: { questionId: question, orderIndex: 1 } } } });
    const attempt = await prisma.testAttempt.create({ data: { userId: user, testId: test, score: 0, userAnswers: { create: { questionId: question, selectedOption: index ? "C" : "B", isCorrect: false } } }, include: { userAnswers: true } });
    attempts.push({ id: attempt.id, answer: attempt.userAnswers[0].id });
  }
  return { question, first: attempts[0], second: attempts[1] };
}
async function launch(user: string, answer: string) {
  const work = explain.POST(await request(user, { userAnswerId: answer }));
  inFlight.push(work); return work;
}
async function hideQuestion(question: string) {
  const response = await hide.POST(await request(admin, { reason: "Kiểm tra lại lời giải giả lập" }), params(question));
  assert.equal(response.status, 200);
}
async function cache(question: string) {
  return prisma.questionExplanationCache.findUniqueOrThrow({ where: { questionId_contentRevision_locale_promptVersion: { questionId: question, contentRevision: 1, locale: "vi", promptVersion: 1 } } });
}
async function expire(question: string) {
  const current = await cache(question);
  await prisma.questionExplanationCache.update({ where: { id: current.id }, data: { startedAt: new Date(0) } });
}

describe("explanation ownership and hiding through PostgreSQL APIs with a blocked network provider", () => {
  it("coalesces concurrent requests and reuses one canonical result for another learner without a provider call", { timeout: 15_000 }, async () => {
    const f = await fixture(), first = gate();
    providerReply = async () => { first.started.resolve(); return first.result.promise; };
    const work = launch(learner, f.first.answer); await first.started.promise;
    const responses = await Promise.all(Array.from({ length: 10 }, () => launch(learner, f.first.answer)));
    assert.ok(responses.every(response => response.status === 409)); assert.equal(providerCalls, 1);
    first.result.resolve(providerResponse("one shared generation")); assert.equal((await work).status, 200);
    const cached = await launch(other, f.second.answer); assert.equal(cached.status, 200);
    const payload = await cached.json(); assert.equal(payload.explanation.cached, true); assert.match(payload.explanation.explanationText, /C reason/);
    assert.equal(providerCalls, 1); assert.equal(await prisma.aiExplanation.count({ where: { userAnswer: { questionId: f.question } } }), 2);
    assert.equal(await prisma.userAiUsage.count({ where: { key: { endsWith: `:explain:${other}` } } }), 0);
  });
  it("does not explain another learner's answer or an already correct answer", async () => {
    const f = await fixture();
    assert.equal((await launch(other, f.first.answer)).status, 404);
    await prisma.userAnswer.update({ where: { id: f.first.answer }, data: { selectedOption: "A", isCorrect: true } });
    assert.equal((await launch(learner, f.first.answer)).status, 422); assert.equal(providerCalls, 0);
  });
  it("an expired generation cannot save over its replacement or create a stale personal explanation", { timeout: 15_000 }, async () => {
    const f = await fixture(), old = gate(), fresh = gate();
    providerReply = async index => { const value = index ? fresh : old; value.started.resolve(); return value.result.promise; };
    const first = launch(learner, f.first.answer); await old.started.promise; await expire(f.question);
    const second = launch(other, f.second.answer); await fresh.started.promise;
    const replacement = await cache(f.question);
    old.result.resolve(providerResponse("obsolete generation")); assert.equal((await first).status, 409);
    assert.deepEqual(await cache(f.question), replacement); assert.equal(await prisma.aiExplanation.count({ where: { userAnswer: { questionId: f.question } } }), 0);
    fresh.result.resolve(providerResponse("replacement generation")); assert.equal((await second).status, 200);
    assert.equal((await cache(f.question)).status, "READY"); assert.match(JSON.stringify((await cache(f.question)).explanation), /replacement generation/);
  });
  it("an expired provider failure cannot mark a replacement generation failed", { timeout: 15_000 }, async () => {
    const f = await fixture(), old = gate(), fresh = gate();
    providerReply = async index => { const value = index ? fresh : old; value.started.resolve(); return value.result.promise; };
    const first = launch(learner, f.first.answer); await old.started.promise; await expire(f.question);
    const second = launch(other, f.second.answer); await fresh.started.promise;
    const replacement = await cache(f.question);
    old.result.resolve(new Response("fixture failure", { status: 500 })); assert.equal((await first).status, 503);
    assert.deepEqual(await cache(f.question), replacement);
    fresh.result.resolve(providerResponse("replacement after failure")); assert.equal((await second).status, 200);
  });
  it("hiding an in-flight explanation prevents completion and future explanation requests", { timeout: 15_000 }, async () => {
    const f = await fixture(), first = gate();
    providerReply = async () => { first.started.resolve(); return first.result.promise; };
    const work = launch(learner, f.first.answer); await first.started.promise; await hideQuestion(f.question);
    first.result.resolve(providerResponse("hidden generation")); assert.equal((await work).status, 409);
    assert.equal((await cache(f.question)).status, "HIDDEN"); assert.equal(await prisma.aiExplanation.count({ where: { userAnswer: { questionId: f.question } } }), 0);
    const denied = await launch(other, f.second.answer); assert.equal(denied.status, 422); assert.equal((await denied.json()).error.code, "EXPLANATION_HIDDEN"); assert.equal(providerCalls, 1);
  });
  it("revalidates a READY snapshot if an administrator hides it before a personal copy is saved", async () => {
    const f = await fixture();
    assert.equal((await launch(learner, f.first.answer)).status, 200);
    afterCacheRead = async () => { afterCacheRead = undefined; await hideQuestion(f.question); };
    assert.equal((await launch(other, f.second.answer)).status, 409);
    assert.equal(await prisma.aiExplanation.count({ where: { userAnswer: { questionId: f.question } } }), 0); assert.equal(providerCalls, 1);
  });
  it("suppresses legacy hidden copies in history and guest results without deleting attempts or scores", async () => {
    const f = await fixture();
    await prisma.aiExplanation.create({ data: { userAnswerId: f.first.answer, explanationText: "obsolete personal explanation" } });
    await hideQuestion(f.question);
    assert.equal(await prisma.aiExplanation.count({ where: { userAnswer: { questionId: f.question } } }), 0);
    // Simulate a copy left by an older deployment after its hide operation.
    await prisma.aiExplanation.create({ data: { userAnswerId: f.first.answer, explanationText: "legacy hidden text" } });
    const response = await history.GET(await request(learner), params(f.first.id)); assert.equal(response.status, 200);
    const payload = await response.json(); assert.equal(payload.attempt.score, 0); assert.equal(payload.attempt.userAnswers[0].aiExplanation, null);
    assert.ok(!JSON.stringify(payload).includes("legacy hidden text")); assert.ok(!JSON.stringify(payload).includes("explanationCaches"));
    assert.equal((await history.GET(await request(other), params(f.first.id))).status, 404);
    const challengeToken = await guestChallenge.createGuestChallenge([f.question]);
    const submitted = await guest.POST(new Request("https://integration.invalid/guest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challengeToken, answers: { [f.question]: "B" } }) }));
    assert.equal(submitted.status, 200); assert.equal((await submitted.json()).results[0].explanationText, null);
    assert.equal(providerCalls, 0); assert.equal(await prisma.testAttempt.count({ where: { test: { id: { in: tests } } } }), tests.length);
  });
  it("quota denial does not start a provider request and retains the retry cooldown", async () => {
    const f = await fixture(), key = `${new Date().toISOString().slice(0, 10)}:explain:${learner}`;
    await prisma.userAiUsage.create({ data: { key, count: 20, expiresAt: new Date(Date.now() + 60_000) } });
    const response = await launch(learner, f.first.answer); assert.equal(response.status, 429); assert.equal((await response.json()).error.code, "AI_DAILY_LIMIT");
    assert.equal((await cache(f.question)).status, "FAILED"); assert.equal((await launch(learner, f.first.answer)).status, 409); assert.equal(providerCalls, 0);
  });
  it("rolls back READY publication if the answer disappears before its personal explanation can be saved", { timeout: 15_000 }, async () => {
    const f = await fixture(), first = gate();
    providerReply = async () => { first.started.resolve(); return first.result.promise; };
    const work = launch(learner, f.first.answer); await first.started.promise;
    await prisma.userAnswer.delete({ where: { id: f.first.answer } });
    first.result.resolve(providerResponse("must roll back")); assert.equal((await work).status, 503);
    const row = await cache(f.question); assert.equal(row.status, "FAILED"); assert.equal(row.explanation, null); assert.equal(row.generatedAt, null);
    assert.equal(await prisma.aiExplanation.count({ where: { userAnswer: { questionId: f.question } } }), 0);
  });
});
