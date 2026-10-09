import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const database = process.env.TEST_DATABASE_URL;
if (!database || process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") throw new Error("Explicit isolated database required");
const target = new URL(database);
if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || target.pathname !== "/toeic_release_test" || process.env.NODE_ENV === "production") {
  throw new Error("Only isolated local toeic_release_test is accepted");
}
process.env.DATABASE_URL = database;
process.env.MOBILE_JWT_SECRET = "integration-only-reading-journey-secret";
process.env.RATE_LIMIT_STORE = "database";
const admin = randomUUID(), learner = randomUUID(), otherLearner = randomUUID();
const documentId = randomUUID(), jobId = randomUUID();
const ownUsers = [admin, learner, otherLearner];
let prisma: PrismaClient;
let content: import("../../app/lib/question-import").ExtractedData;
let contributions: typeof import("../../app/api/v1/contributions/route");
let review: typeof import("../../app/api/v1/contributions/[id]/review/route");
let library: typeof import("../../app/api/v1/library/route");
let start: typeof import("../../app/api/v1/library/[id]/test/route");
let detail: typeof import("../../app/api/v1/tests/[id]/route");
let submit: typeof import("../../app/api/v1/tests/[id]/submit/route");
let result: typeof import("../../app/api/v1/attempts/[id]/route");
let history: typeof import("../../app/api/v1/attempts/route");
let progress: typeof import("../../app/api/v1/progress/route");
let contributionId: string;
const lessons: Array<{ id: string; parts: number[]; questionCount: number; playable: boolean }> = [];
let submittedTestId: string, attemptId: string;

before(async () => {
  prisma = (await import("../../app/lib/prisma")).prisma;
  const { extractedDataSchema } = await import("../../app/lib/question-import");
  content = extractedDataSchema.parse(JSON.parse(readFileSync(new URL("../../content/qa/original-reading.json", import.meta.url), "utf8")));
  contributions = await import("../../app/api/v1/contributions/route");
  review = await import("../../app/api/v1/contributions/[id]/review/route");
  library = await import("../../app/api/v1/library/route");
  start = await import("../../app/api/v1/library/[id]/test/route");
  detail = await import("../../app/api/v1/tests/[id]/route");
  submit = await import("../../app/api/v1/tests/[id]/submit/route");
  result = await import("../../app/api/v1/attempts/[id]/route");
  history = await import("../../app/api/v1/attempts/route");
  progress = await import("../../app/api/v1/progress/route");
  await prisma.user.createMany({ data: ownUsers.map(id => ({ id, email: `${id}@test.invalid`, role: id === admin ? "ADMIN" as const : "USER" as const })) });
  await prisma.uploadedAsset.create({ data: { id: documentId, ownerId: admin, kind: "DOCUMENT", status: "READY", originalName: "original-reading-private.pdf", contentType: "application/pdf", sizeBytes: 4, objectKey: `reading-fixture/${documentId}` } });
  // Extraction is a fixture. All review, publication, test and result handlers below are real.
  await prisma.ingestionJob.create({ data: { id: jobId, ownerId: admin, documentAssetId: documentId, status: "COMPLETED", result: content } });
});
after(async () => {
  if (!prisma) return;
  await prisma.miniTest.deleteMany({ where: { createdById: { in: ownUsers } } });
  await prisma.question.deleteMany({ where: { contribution: { sourceJobId: jobId } } });
  await prisma.questionGroup.deleteMany({ where: { contribution: { sourceJobId: jobId } } });
  await prisma.authorizationAuditEvent.deleteMany({ where: { actorId: { in: ownUsers } } });
  await prisma.contentContribution.deleteMany({ where: { sourceJobId: jobId } });
  await prisma.ingestionJob.deleteMany({ where: { id: jobId } });
  await prisma.uploadedAsset.deleteMany({ where: { id: documentId } });
  await prisma.user.deleteMany({ where: { id: { in: ownUsers } } });
  const scopes = [`contribution-submit:${admin}`, `contribution-review:${admin}`, `mobile-test-create:${learner}`, `mobile-test-submit:${learner}`];
  for (const scope of scopes) {
    await prisma.userAiUsage.deleteMany({ where: { key: { startsWith: "rate:v1:", endsWith: `:${createHash("sha256").update(scope).digest("hex")}` } } });
  }
  await prisma.$disconnect();
});
const params = (id: string) => ({ params: Promise.resolve({ id }) });
async function request(user: string, body?: unknown) {
  const token = await new SignJWT({ tokenUse: "access" }).setProtectedHeader({ alg: "HS256" }).setSubject(user)
    .setIssuer("toeic-mini-trainer").setAudience("toeic-mobile").setExpirationTime("5m")
    .sign(new TextEncoder().encode(process.env.MOBILE_JWT_SECRET));
  return new Request("https://integration.invalid/reading", { method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

describe("Reading acceptance journey through PostgreSQL handlers", () => {
  it("publishes only reviewed original content and does not duplicate concurrent approval", async () => {
    assert.equal((await contributions.POST(await request(learner, { jobId, data: content, rightsConfirmed: true }))).status, 403);
    const response = await contributions.POST(await request(admin, { jobId, data: content, rightsConfirmed: true }));
    assert.equal(response.status, 201);
    contributionId = (await response.json()).contribution.id;
    assert.equal(await prisma.question.count({ where: { contributionId } }), 0);
    const approved = await Promise.all([0, 1].map(async () => review.POST(await request(admin, { decision: "APPROVE" }), params(contributionId))));
    assert.deepEqual(approved.map(response => response.status).sort(), [200, 409]);
    assert.equal(await prisma.question.count({ where: { contributionId, publicationStatus: "PUBLISHED", ownerId: null } }), 20);
    assert.equal(await prisma.authorizationAuditEvent.count({ where: { targetId: contributionId, action: "CONTRIBUTION_APPROVED" } }), 1);
  });

  it("lists and opens complete Part 5, 6 and 7 groups with passages and without answer keys", async () => {
    const groups = await prisma.questionGroup.findMany({ where: { contributionId }, select: { id: true } });
    const ownGroups = new Set(groups.map(group => group.id));
    const response = await library.GET(await request(learner));
    assert.equal(response.status, 200);
    const payload = await response.json();
    lessons.push(...payload.lessons.filter((lesson: { id: string }) => ownGroups.has(lesson.id)));
    assert.equal(lessons.length, 4);
    assert.deepEqual(lessons.map(lesson => lesson.questionCount).sort((a, b) => a - b), [3, 3, 4, 10]);
    assert.ok(lessons.every(lesson => lesson.playable));
    for (const hidden of ["correctAnswer", documentId, "original-reading-private.pdf"]) assert.ok(!JSON.stringify(payload).includes(hidden));
    for (const lesson of lessons) {
      const made = await start.POST(await request(learner, {}), params(lesson.id));
      assert.equal(made.status, 201);
      const testId = (await made.json()).test.id;
      const opened = await detail.GET(await request(learner), params(testId));
      assert.equal(opened.status, 200);
      const test = (await opened.json()).test;
      assert.equal(test.ownerId, learner);
      assert.equal(test.questions.length, lesson.questionCount);
      assert.ok(!JSON.stringify(test).includes("correctAnswer"));
      assert.ok(test.questions.every((item: { question: { group: { id: string; passageText: string | null } } }) => item.question.group.id === lesson.id));
      if (lesson.parts[0] >= 6) assert.ok(test.questions.every((item: { question: { group: { passageText: string } } }) => item.question.group.passageText.length > 100));
      assert.equal((await detail.GET(await request(otherLearner), params(testId))).status, 404);
      if (lesson.parts[0] === 6) submittedTestId = testId;
    }
  });

  it("scores correct, wrong and blank answers once under simultaneous submission retries", async () => {
    const test = await prisma.miniTest.findUniqueOrThrow({ where: { id: submittedTestId }, include: { questions: { orderBy: { orderIndex: "asc" }, include: { question: true } } } });
    assert.equal(test.questions.length, 4);
    const ids = test.questions.map(item => item.questionId);
    const wrong = Object.keys(test.questions[1].question.options as Record<string, string>).find(key => key !== test.questions[1].question.correctAnswer)!;
    const body = { clientSubmissionId: randomUUID(), durationSeconds: 75, answers: { [ids[0]]: test.questions[0].question.correctAnswer, [ids[1]]: wrong, [ids[2]]: test.questions[2].question.correctAnswer } };
    const responses = await Promise.all([0, 1, 2].map(async () => {
      const response = await submit.POST(await request(learner, body), params(submittedTestId));
      assert.equal(response.status, 200); return response.json();
    }));
    attemptId = responses[0].attemptId;
    assert.equal(new Set(responses.map(response => response.attemptId)).size, 1);
    assert.ok(responses.every(response => response.score === 2 && response.total === 4));
    assert.equal(await prisma.testAttempt.count({ where: { testId: submittedTestId } }), 1);
    const rows = await prisma.userAnswer.findMany({ where: { attemptId } });
    assert.equal(rows.find(row => row.questionId === ids[3])?.selectedOption, null);
    assert.equal(rows.filter(row => row.isCorrect).length, 2);
  });

  it("keeps review questions in the original test order even when answer IDs sort backwards", async () => {
    const links = await prisma.miniTestQuestion.findMany({ where: { testId: submittedTestId }, orderBy: { orderIndex: "asc" } });
    const prefix = randomUUID().slice(0, 24);
    for (const [index, link] of links.entries()) {
      const row = await prisma.userAnswer.findFirstOrThrow({ where: { attemptId, questionId: link.questionId } });
      await prisma.userAnswer.update({ where: { id: row.id }, data: { id: `${prefix}${String(links.length - index).padStart(12, "0")}` } });
    }
    const response = await result.GET(await request(learner), params(attemptId));
    assert.equal(response.status, 200);
    const attempt = (await response.json()).attempt;
    assert.deepEqual(attempt.userAnswers.map((answer: { question: { id: string } }) => answer.question.id), links.map(link => link.questionId));
    assert.equal(attempt.score, 2); assert.equal(attempt.total, 4);
    assert.deepEqual(Object.keys(attempt.test).sort(), ["id", "title"], "Internal question ordering must not change the public test contract");
    assert.ok(attempt.userAnswers.every((answer: { question: { correctAnswer: string; group: { passageText: string } } }) => answer.question.correctAnswer && answer.question.group.passageText));
  });

  it("shows one result and correct Part statistics only to the learner who submitted", async () => {
    const response = await history.GET(await request(learner));
    const attempts = (await response.json()).attempts;
    assert.equal(attempts.length, 1); assert.equal(attempts[0].id, attemptId);
    assert.equal(attempts[0].score, 2); assert.equal(attempts[0].accuracy, 50);
    const summary = await progress.GET(await request(learner));
    assert.deepEqual(await summary.json(), { totalTests: 1, totalAnswered: 4, overallAccuracy: 50, partStats: [{ part: 6, total: 4, accuracy: 50 }] });
    assert.equal((await result.GET(await request(otherLearner), params(attemptId))).status, 404);
    assert.equal((await history.GET(await request(otherLearner))).status, 200);
    assert.deepEqual((await (await history.GET(await request(otherLearner))).json()).attempts, []);
  });
});
