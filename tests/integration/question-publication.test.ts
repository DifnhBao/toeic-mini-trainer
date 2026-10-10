import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") throw new Error("Explicit isolated database required");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.pathname !== "/toeic_release_test" || process.env.NODE_ENV === "production") throw new Error("Only isolated local toeic_release_test accepted");
process.env.DATABASE_URL = databaseUrl;
process.env.MOBILE_JWT_SECRET = "integration-only-question-publication-secret";
const admin = randomUUID(), learner = randomUUID(), reviewer = randomUUID();
const document = randomUUID(), job = randomUUID(), contribution = randomUUID();
const audio = randomUUID(), image = randomUUID(), privateAudio = randomUUID(), failedAudio = randomUUID(), wrongKind = randomUUID();
const questionIds: string[] = [], groupIds: string[] = [];
let prisma: PrismaClient;
let publish: typeof import("../../app/api/v1/admin/questions/[id]/publish/route");
let archive: typeof import("../../app/api/v1/admin/questions/[id]/archive/route");
const params = (id: string) => ({ params: Promise.resolve({ id }) });

before(async () => {
  prisma = (await import("../../app/lib/prisma")).prisma;
  publish = await import("../../app/api/v1/admin/questions/[id]/publish/route");
  archive = await import("../../app/api/v1/admin/questions/[id]/archive/route");
  await prisma.user.createMany({ data: [{ id: admin, role: "ADMIN" as const }, { id: learner, role: "USER" as const }, { id: reviewer, role: "REVIEWER" as const }].map(user => ({ ...user, email: `${user.id}@test.invalid` })) });
  await prisma.uploadedAsset.createMany({ data: [
    { id: document, ownerId: admin, kind: "DOCUMENT", status: "READY", objectKey: `fixture/${document}.pdf`, originalName: "fixture.pdf", contentType: "application/pdf", sizeBytes: 4 },
    ...[audio, privateAudio, failedAudio].map(id => ({ id, ownerId: id === privateAudio ? admin : null, kind: "AUDIO" as const,
      status: id === failedAudio ? "REJECTED" as const : "READY" as const, objectKey: `fixture/${id}.mp3`, originalName: "fixture.mp3", contentType: "audio/mpeg", sizeBytes: 64 })),
    ...[image, wrongKind].map(id => ({ id, ownerId: null, kind: "IMAGE" as const, status: "READY" as const,
      objectKey: `fixture/${id}.png`, originalName: "fixture.png", contentType: "image/png", sizeBytes: 64 })),
  ] });
  await prisma.ingestionJob.create({ data: { id: job, ownerId: admin, documentAssetId: document, status: "COMPLETED" } });
  await prisma.contentContribution.create({ data: { id: contribution, ownerId: admin, sourceJobId: job, status: "APPROVED", data: { data: [] } } });
});
after(async () => {
  if (!prisma) return;
  await prisma.authorizationAuditEvent.deleteMany({ where: { actorId: admin } });
  await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
  await prisma.questionGroup.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.contentContribution.deleteMany({ where: { id: contribution } });
  await prisma.ingestionJob.deleteMany({ where: { id: job } });
  await prisma.uploadedAsset.deleteMany({ where: { id: { in: [document, audio, image, privateAudio, failedAudio, wrongKind] } } });
  await prisma.user.deleteMany({ where: { id: { in: [admin, learner, reviewer] } } });
  await prisma.$disconnect();
});
async function request(user = admin, body: unknown = { reason: "Đã kiểm tra bộ câu hỏi giả lập" }) {
  const token = await new SignJWT({ tokenUse: "access" }).setProtectedHeader({ alg: "HS256" }).setSubject(user)
    .setIssuer("toeic-mini-trainer").setAudience("toeic-mobile").setExpirationTime("5m")
    .sign(new TextEncoder().encode(process.env.MOBILE_JWT_SECRET));
  return new Request("https://integration.invalid/publish", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
}
async function question(patch: Partial<Prisma.QuestionUncheckedCreateInput> = {}) {
  const id = randomUUID(); questionIds.push(id);
  await prisma.question.create({ data: { id, ownerId: null, publicationStatus: "LEGACY", part: 5,
    content: "The sample ___ ready.", options: { A: "is", B: "are" }, correctAnswer: "A", ...patch } });
  return id;
}
async function group(patch: Partial<Prisma.QuestionGroupUncheckedCreateInput> = {}) {
  const id = randomUUID(); groupIds.push(id);
  await prisma.questionGroup.create({ data: { id, ownerId: null, groupType: "AUDIO", contributionId: contribution, audioAssetId: audio, imageAssetId: image, ...patch } });
  return id;
}
async function rejected(id: string, code: string, status: number) {
  const response = await publish.POST(await request(), params(id));
  assert.equal(response.status, status); assert.equal((await response.json()).error.code, code);
  assert.equal((await prisma.question.findUniqueOrThrow({ where: { id } })).publicationStatus, "LEGACY");
  assert.equal(await prisma.authorizationAuditEvent.count({ where: { targetId: id } }), 0);
}

describe("publication preflight through real PostgreSQL APIs", () => {
  it("requires an active admin, valid input and a shared eligible question", async () => {
    const id = await question();
    for (const user of [learner, reviewer]) assert.equal((await publish.POST(await request(user), params(id))).status, 403);
    assert.equal((await publish.POST(new Request("https://integration.invalid/", { method: "POST", headers: { authorization: "Bearer invalid" } }), params(id))).status, 401);
    assert.equal((await publish.POST(await request(), params("not-a-uuid"))).status, 400);
    assert.equal((await publish.POST(await request(admin, { reason: "x" }), params(id))).status, 400);
    const privateId = await question({ ownerId: admin, publicationStatus: "PRIVATE" });
    assert.equal((await publish.POST(await request(), params(privateId))).status, 404);
    assert.equal((await publish.POST(await request(), params(randomUUID()))).status, 404);
    assert.equal(await prisma.authorizationAuditEvent.count({ where: { actorId: admin } }), 0);
  });
  it("rejects malformed legacy answers and choices without publication or audit", async () => {
    for (const patch of [{ correctAnswer: "D" }, { options: ["yes", "no"] }, { options: { A: "yes", B: " " } }, { part: 8 }, { content: null }]) {
      await rejected(await question(patch), "INVALID_CONTENT", 422);
    }
  });
  it("requires listening audio and a Part 1 image even when republishing old data", async () => {
    for (const part of [1, 2, 3, 4]) await rejected(await question({ part }), "MEDIA_REQUIRED", 422);
    await rejected(await question({ part: 1, groupId: await group({ imageAssetId: null }) }), "MEDIA_REQUIRED", 422);
  });
  it("does not trust a reviewed group with private, rejected or wrongly typed assets or legacy URLs", async () => {
    for (const audioAssetId of [privateAudio, failedAudio, wrongKind]) {
      await rejected(await question({ part: 1, groupId: await group({ audioAssetId }) }), "MEDIA_UNAVAILABLE", 409);
    }
    for (const patch of [{ contributionId: null }, { ownerId: admin }, { audioUrl: "/uploads/legacy.mp3" }]) {
      await rejected(await question({ part: 1, groupId: await group(patch) }), "MEDIA_REVIEW_REQUIRED", 409);
    }
  });
  it("rejects missing or visually empty reading passages and accepts readable text", async () => {
    for (const passageText of [null, "<p><br></p>", "<p>&nbsp;</p>"]) {
      await rejected(await question({ part: 7, groupId: await group({ passageText, audioAssetId: null, imageAssetId: null }) }), "PASSAGE_REQUIRED", 422);
    }
    const id = await question({ part: 6, groupId: await group({ passageText: "<p>A fixture passage.</p>", audioAssetId: null, imageAssetId: null }) });
    assert.equal((await publish.POST(await request(), params(id))).status, 200);
  });
  it("publishes a valid shared listening question once and validates again after archive", async () => {
    const groupId = await group();
    const id = await question({ part: 1, content: null, groupId });
    const statuses = await Promise.all([0, 1].map(async () => (await publish.POST(await request(), params(id))).status));
    assert.deepEqual(statuses.sort(), [200, 404]);
    assert.equal(await prisma.authorizationAuditEvent.count({ where: { targetId: id, action: "PUBLIC_QUESTION_PUBLISHED" } }), 1);
    assert.equal((await archive.POST(await request(), params(id))).status, 200);
    await prisma.questionGroup.update({ where: { id: groupId }, data: { imageAssetId: null } });
    const invalid = await publish.POST(await request(), params(id));
    assert.equal(invalid.status, 422); assert.equal((await invalid.json()).error.code, "MEDIA_REQUIRED");
    assert.equal((await prisma.question.findUniqueOrThrow({ where: { id } })).publicationStatus, "ARCHIVED");
    await prisma.questionGroup.update({ where: { id: groupId }, data: { imageAssetId: image } });
    assert.equal((await publish.POST(await request(), params(id))).status, 200);
    assert.equal(await prisma.authorizationAuditEvent.count({ where: { targetId: id, action: "PUBLIC_QUESTION_PUBLISHED" } }), 2);
  });
});
