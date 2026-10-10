import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { Prisma, type PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { restoreWebTestDraft } from "../app/lib/web-test-draft";

const testId = "00000000-0000-4000-8000-000000000011";
const q1 = "00000000-0000-4000-8000-000000000012";
const q2 = "00000000-0000-4000-8000-000000000013";
const submissionId = "00000000-0000-4000-8000-000000000014";
const secret = "test-only-submission-secret-never-used-outside-tests";
const priorSecret = process.env.MOBILE_JWT_SECRET;
let web: typeof import("../app/api/mini-tests/[id]/submit/route");
let mobile: typeof import("../app/api/v1/tests/[id]/submit/route");
let active = true;
let caller = "owner";
let created = 0;
let lookupCount = 0;
let saved: Record<string, unknown> | null = null;
let duplicate: { id: string; userId: string; testId: string; score: number; _count: { userAnswers: number } } | null = null;
let simulateRace = false;
const context = { params: Promise.resolve({ id: testId }) };
const unexpected = async () => { throw new Error("Unexpected database call"); };

before(async () => {
  process.env.MOBILE_JWT_SECRET = secret;
  const fake = {
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, role: "USER", status: active ? "ACTIVE" : "SUSPENDED" }) },
    miniTest: { findFirst: async ({ where }: { where: { id: string; createdById: string } }) => {
      lookupCount += 1;
      if (where.id !== testId || where.createdById !== "owner") return null;
      return { id: testId, questions: [
        { question: { id: q1, correctAnswer: "A", options: { A: "yes", B: "no" } } },
        { question: { id: q2, correctAnswer: "C", options: { A: "one", B: "two", C: "three" } } },
      ] };
    } },
    testAttempt: {
      findUnique: async () => duplicate,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        // Mirrors the unique constraint, including two requests that both read
        // an empty result before either creates the attempt.
        if (duplicate) throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "7.10.0" });
        saved = data;
        duplicate = { id: "attempt", userId: String(data.userId), testId: String(data.testId), score: Number(data.score), _count: { userAnswers: 2 } };
        created += 1;
        if (simulateRace) throw new Prisma.PrismaClientKnownRequestError("race", { code: "P2002", clientVersion: "7.10.0" });
        return { id: "attempt" };
      },
    },
    $transaction: unexpected,
  } as unknown as PrismaClient;
  (global as unknown as { prisma: PrismaClient }).prisma = fake;
  web = await import("../app/api/mini-tests/[id]/submit/route");
  mobile = await import("../app/api/v1/tests/[id]/submit/route");
});

beforeEach(() => {
  active = true; caller = "owner"; created = 0; lookupCount = 0;
  saved = null; duplicate = null; simulateRace = false;
});
after(() => {
  if (priorSecret === undefined) delete process.env.MOBILE_JWT_SECRET;
  else process.env.MOBILE_JWT_SECRET = priorSecret;
});

async function request(body: unknown, tokenOverride?: string) {
  const token = tokenOverride ?? await new SignJWT({ tokenUse: "access" }).setProtectedHeader({ alg: "HS256" })
    .setSubject(caller).setIssuer("toeic-mini-trainer").setAudience("toeic-mobile").setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
  return new Request("https://test.invalid/submit", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const payload = () => ({ clientSubmissionId: submissionId, durationSeconds: 23, answers: { [q1]: "A" } });

describe("shared web/mobile submission", () => {
  it("scores on the server, saves skipped questions and rejects injected scoring fields", async () => {
    assert.equal((await web.POST(await request({ ...payload(), score: 99 }), context)).status, 400);
    const response = await web.POST(await request(payload()), context);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { attemptId: "attempt", score: 1, total: 2 });
    assert.equal(saved?.durationSeconds, 23);
    assert.deepEqual(saved?.userAnswers, { create: [
      { questionId: q1, selectedOption: "A", isCorrect: true },
      { questionId: q2, selectedOption: null, isCorrect: false },
    ] });
    assert.match(response.headers.get("cache-control")!, /no-store/);
  });

  it("returns the same attempt when retried through either client", async () => {
    const first = await web.POST(await request(payload()), context);
    const retry = await mobile.POST(await request(payload()), context);
    assert.equal((await first.json()).attemptId, (await retry.json()).attemptId);
    assert.equal(created, 1);
  });

  it("resolves concurrent submissions to one stored attempt", async () => {
    const [one, two] = await Promise.all([
      web.POST(await request(payload()), context), mobile.POST(await request(payload()), context),
    ]);
    assert.equal(one.status, 200); assert.equal(two.status, 200);
    assert.equal(created, 1);
  });

  it("recovers a unique-key race after an earlier request committed", async () => {
    simulateRace = true;
    const response = await web.POST(await request(payload()), context);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).duplicate, true);
    assert.equal(created, 1);
  });

  it("rejects another user's test and another user's submission key", async () => {
    caller = "other";
    assert.equal((await web.POST(await request(payload()), context)).status, 404);
    duplicate = { id: "foreign", userId: "owner", testId, score: 2, _count: { userAnswers: 2 } };
    assert.equal((await web.POST(await request(payload()), context)).status, 409);
    assert.equal(created, 0);
  });

  it("rejects IDs outside the test and choices absent from the question", async () => {
    assert.equal((await web.POST(await request({ ...payload(), answers: { [submissionId]: "A" } }), context)).status, 400);
    assert.equal((await web.POST(await request({ ...payload(), answers: { [q2]: "D" } }), context)).status, 400);
    assert.equal(created, 0);
  });

  it("rejects invalid tokens and suspended accounts before reading a test", async () => {
    assert.equal((await web.POST(await request(payload(), "invalid"), context)).status, 401);
    active = false;
    assert.equal((await mobile.POST(await request(payload()), context)).status, 401);
    assert.equal(lookupCount, 0); assert.equal(created, 0);
  });

  it("rejects missing submission identity, invalid duration and malformed test IDs", async () => {
    assert.equal((await web.POST(await request({ answers: {} }), context)).status, 400);
    assert.equal((await mobile.POST(await request({ ...payload(), durationSeconds: -1 }), context)).status, 400);
    assert.equal((await web.POST(await request(payload()), { params: Promise.resolve({ id: "bad" }) })).status, 400);
    assert.equal(created, 0);
  });
});

describe("web attempt draft recovery", () => {
  const questions = [{ id: q1, options: { A: "yes", B: "no" } }];
  it("keeps the submission ID and elapsed time across reloads", () => {
    const restored = restoreWebTestDraft(JSON.stringify({
      version: 1, clientSubmissionId: submissionId, answers: { [q1]: "B" }, elapsed: 83, currentIndex: 0,
    }), questions, testId);
    assert.equal(restored.clientSubmissionId, submissionId);
    assert.equal(restored.elapsed, 83);
    assert.deepEqual(restored.answers, { [q1]: "B" });
  });
  it("migrates old drafts and removes foreign questions and unavailable options", () => {
    assert.deepEqual(restoreWebTestDraft(JSON.stringify({ [q1]: "A", [q2]: "C" }), questions, submissionId).answers, { [q1]: "A" });
    assert.deepEqual(restoreWebTestDraft(JSON.stringify({ [q1]: "D" }), questions, submissionId).answers, {});
  });
  it("recovers safely from corrupt data without inventing reviewed answers", () => {
    assert.deepEqual(restoreWebTestDraft("broken", questions, submissionId).answers, {});
    assert.equal(restoreWebTestDraft(null, questions, submissionId).clientSubmissionId, submissionId);
  });
});
