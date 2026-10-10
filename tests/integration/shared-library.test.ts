import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") throw new Error("Explicit isolated database required");
const target = new URL(url);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.pathname !== "/toeic_release_test" || process.env.NODE_ENV === "production") {
  throw new Error("Only isolated local toeic_release_test is accepted");
}
process.env.DATABASE_URL = url;
process.env.MOBILE_JWT_SECRET = "integration-only-library-secret-never-deployed";
process.env.RATE_LIMIT_STORE = "database";
let prisma: PrismaClient;
let library: typeof import("../../app/lib/shared-library");
let catalogueRoute: typeof import("../../app/api/v1/library/route");
let startRoute: typeof import("../../app/api/v1/library/[id]/test/route");
const admin = randomUUID(); const learner = randomUUID();
const documentId = randomUUID(); const audioId = randomUUID();
const jobs = [randomUUID(), randomUUID()]; const contributions = [randomUUID(), randomUUID()];
const groups: string[] = Array.from({ length: 25 }, () => randomUUID());
const questions: string[] = [];
before(async () => {
  prisma = (await import("../../app/lib/prisma")).prisma;
  library = await import("../../app/lib/shared-library");
  catalogueRoute = await import("../../app/api/v1/library/route");
  startRoute = await import("../../app/api/v1/library/[id]/test/route");
  await prisma.user.createMany({ data: [{ id: admin, role: "ADMIN" as const }, { id: learner }].map((user) => ({ ...user, email: `${user.id}@test.invalid` })) });
  await prisma.uploadedAsset.createMany({ data: [
    { id: documentId, ownerId: admin, kind: "DOCUMENT", status: "READY", objectKey: `integration/${documentId}`, originalName: "private-source.pdf", contentType: "application/pdf", sizeBytes: 3 },
    { id: audioId, ownerId: null, kind: "AUDIO", status: "READY", objectKey: `integration/${audioId}`, originalName: "private-audio-name.wav", contentType: "audio/wav", sizeBytes: 3 },
  ] });
  for (let index = 0; index < 2; index++) {
    await prisma.ingestionJob.create({ data: { id: jobs[index], ownerId: admin, documentAssetId: documentId, status: "COMPLETED" } });
    await prisma.contentContribution.create({ data: { id: contributions[index], ownerId: admin, sourceJobId: jobs[index], status: index ? "PENDING" : "APPROVED", data: {} } });
  }
  for (let index = 0; index < groups.length; index++) {
    await prisma.questionGroup.create({ data: {
      id: groups[index], ownerId: index === 21 ? admin : null, contributionId: contributions[index === 22 ? 1 : 0],
      groupType: index === 0 ? "AUDIO" : "TEXT", audioAssetId: index === 0 ? audioId : null,
    } });
    for (let q = 0; q < (index === 0 ? 5 : index === 23 ? 51 : 1); q++) {
      const id = randomUUID(); questions.push(id);
      await prisma.question.create({ data: {
        id, groupId: groups[index], contributionId: contributions[0],
        ownerId: index === 24 || (index === 0 && q === 3) ? admin : null,
        publicationStatus: index === 0 && q === 3 ? "PRIVATE" : index === 0 && q === 4 ? "ARCHIVED" : "PUBLISHED",
        part: 3, content: "Original isolated library fixture", options: { A: "one", B: "two" }, correctAnswer: "A",
      } });
    }
  }
});
after(async () => {
  if (!prisma) return;
  await prisma.miniTest.deleteMany({ where: { createdById: learner } });
  await prisma.question.deleteMany({ where: { id: { in: questions } } });
  await prisma.questionGroup.deleteMany({ where: { id: { in: groups } } });
  await prisma.contentContribution.deleteMany({ where: { id: { in: contributions } } });
  await prisma.ingestionJob.deleteMany({ where: { id: { in: jobs } } });
  await prisma.uploadedAsset.deleteMany({ where: { id: { in: [documentId, audioId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [admin, learner] } } });
  const limiterHash = createHash("sha256").update(`mobile-test-create:${learner}`).digest("hex");
  await prisma.userAiUsage.deleteMany({ where: { key: { startsWith: "rate:v1:", endsWith: `:${limiterHash}` } } });
  await prisma.$disconnect();
});
async function request(path: string, method = "GET") {
  const token = await new SignJWT({ tokenUse: "access" }).setProtectedHeader({ alg: "HS256" }).setSubject(learner)
    .setIssuer("toeic-mini-trainer").setAudience("toeic-mobile").setExpirationTime("5m")
    .sign(new TextEncoder().encode(process.env.MOBILE_JWT_SECRET));
  return new Request(`https://integration.invalid${path}`, { method, headers: { authorization: `Bearer ${token}` } });
}
describe("shared lesson catalogue on PostgreSQL", () => {
  it("pages through public approved groups without exposing source, media URLs or answers", async () => {
    const first = await library.sharedLibrary();
    assert.equal(first.lessons.length, 20); assert.ok(first.nextCursor);
    const second = await library.sharedLibrary(first.nextCursor!);
    const lessons = [...first.lessons, ...second.lessons];
    assert.equal(new Set(lessons.map((item) => item.id)).size, 22);
    assert.ok(!lessons.some((item) => [groups[21], groups[22], groups[24]].includes(item.id)));
    const audio = lessons.find((item) => item.id === groups[0]);
    assert.equal(audio?.questionCount, 3); assert.equal(audio?.hasAudio, true);
    assert.equal(lessons.find((item) => item.id === groups[1])?.unavailableReason, "Đang chuẩn bị audio");
    assert.equal(lessons.find((item) => item.id === groups[23])?.playable, false);
    const text = JSON.stringify(lessons);
    for (const hidden of ["correctAnswer", "options", "private-source.pdf", "private-audio-name.wav", documentId, audioId, admin]) assert.ok(!text.includes(hidden));
  });
  it("creates a learner-owned test containing the complete eligible group only", async () => {
    const response = await startRoute.POST(await request("/api/v1/library/test", "POST"), { params: Promise.resolve({ id: groups[0] }) });
    assert.equal(response.status, 201);
    const body = await response.json(); assert.ok(!JSON.stringify(body).includes("correctAnswer"));
    const test = await prisma.miniTest.findUniqueOrThrow({ where: { id: body.test.id }, include: { questions: { orderBy: { orderIndex: "asc" } } } });
    assert.equal(test.createdById, learner); assert.equal(test.questions.length, 3);
    assert.deepEqual(new Set(test.questions.map((item) => item.questionId)), new Set(questions.slice(0, 3)));
    assert.deepEqual(test.questions.map((item) => item.orderIndex), [1, 2, 3]);
  });
  it("rejects private, unapproved, oversized, archived and missing lessons", async () => {
    for (const id of [groups[1], groups[21], groups[22], groups[23], groups[24], randomUUID()]) assert.equal(await library.createSharedLibraryTest(learner, id), null);
    await prisma.uploadedAsset.update({ where: { id: audioId }, data: { status: "REJECTED" } });
    assert.equal(await library.createSharedLibraryTest(learner, groups[0]), null);
    await prisma.uploadedAsset.update({ where: { id: audioId }, data: { status: "READY" } });
    await prisma.question.updateMany({ where: { groupId: groups[0], publicationStatus: "PUBLISHED" }, data: { publicationStatus: "ARCHIVED" } });
    assert.equal(await library.createSharedLibraryTest(learner, groups[0]), null);
    await prisma.question.updateMany({ where: { id: { in: questions.slice(0, 3) } }, data: { publicationStatus: "PUBLISHED" } });
  });
  it("requires authentication, validates cursors and does not cache private responses", async () => {
    const invalid = new Request("https://integration.invalid/api/v1/library", { headers: { authorization: "Bearer invalid" } });
    assert.equal((await catalogueRoute.GET(invalid)).status, 401);
    assert.equal((await startRoute.POST(invalid, { params: Promise.resolve({ id: groups[0] }) })).status, 401);
    assert.equal((await catalogueRoute.GET(await request("/api/v1/library?cursor=invalid"))).status, 400);
    const response = await catalogueRoute.GET(await request("/api/v1/library"));
    assert.equal(response.status, 200); assert.match(response.headers.get("cache-control")!, /no-store/);
  });
});
