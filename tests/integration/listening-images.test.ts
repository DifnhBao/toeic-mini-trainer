import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { SignJWT } from "jose";
import type { PrismaClient } from "@prisma/client";
import { localObjectStorage } from "../helpers/local-object-storage";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") throw new Error("Explicit isolated database required");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.pathname !== "/toeic_release_test" || process.env.NODE_ENV === "production") throw new Error("Only isolated local toeic_release_test accepted");
process.env.DATABASE_URL = databaseUrl;
process.env.MOBILE_JWT_SECRET = "integration-only-listening-image-secret-32-characters";
process.env.RATE_LIMIT_STORE = "database";
const admin = randomUUID(), foreign = randomUUID(), learner = randomUUID();
const documentId = randomUUID(), audioId = randomUUID();
const jobs: string[] = [], contributions: string[] = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kAAAAABJRU5ErkJggg==", "base64");
let prisma: PrismaClient;
let storage: Awaited<ReturnType<typeof localObjectStorage>>;
let upload: typeof import("../../app/api/v1/uploads/route");
let complete: typeof import("../../app/api/v1/uploads/[id]/complete/route");
let attach: typeof import("../../app/api/v1/ingestions/[id]/image/route");
let readJob: typeof import("../../app/api/v1/ingestions/[id]/route");
let submit: typeof import("../../app/api/v1/contributions/route");
let approve: typeof import("../../app/api/v1/contributions/[id]/review/route");
let media: typeof import("../../app/api/v1/contributions/[id]/media/route");
let start: typeof import("../../app/api/v1/library/[id]/test/route");
let readTest: typeof import("../../app/api/v1/tests/[id]/route");
let imageId: string;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
async function request(user: string, body?: unknown) {
  const token = await new SignJWT({ tokenUse: "access" }).setProtectedHeader({ alg: "HS256" }).setSubject(user)
    .setIssuer("toeic-mini-trainer").setAudience("toeic-mobile").setExpirationTime("5m")
    .sign(new TextEncoder().encode(process.env.MOBILE_JWT_SECRET));
  return new Request("https://integration.invalid/", { method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
before(async () => {
  storage = await localObjectStorage();
  Object.assign(process.env, { OBJECT_STORAGE_ENDPOINT: storage.endpoint, OBJECT_STORAGE_BUCKET: "fixture-bucket",
    OBJECT_STORAGE_ACCESS_KEY_ID: "local-fixture", OBJECT_STORAGE_SECRET_ACCESS_KEY: "local-fixture-secret",
    OBJECT_STORAGE_FORCE_PATH_STYLE: "true", OBJECT_STORAGE_REGION: "us-east-1" });
  prisma = (await import("../../app/lib/prisma")).prisma;
  [upload, complete, attach, readJob, submit, approve, media, start, readTest] = await Promise.all([
    import("../../app/api/v1/uploads/route"), import("../../app/api/v1/uploads/[id]/complete/route"),
    import("../../app/api/v1/ingestions/[id]/image/route"), import("../../app/api/v1/ingestions/[id]/route"),
    import("../../app/api/v1/contributions/route"), import("../../app/api/v1/contributions/[id]/review/route"),
    import("../../app/api/v1/contributions/[id]/media/route"), import("../../app/api/v1/library/[id]/test/route"), import("../../app/api/v1/tests/[id]/route"),
  ]);
  await prisma.user.createMany({ data: [{ id: admin, role: "ADMIN" as const }, { id: foreign, role: "ADMIN" as const }, { id: learner, role: "USER" as const }].map(user => ({ ...user, email: `${user.id}@test.invalid` })) });
  const audio = storage.put(`ready/audio/${audioId}.mp3`, Buffer.concat([Buffer.from("ID3"), Buffer.alloc(61)]), "audio/mpeg");
  await prisma.uploadedAsset.createMany({ data: [
    { id: documentId, ownerId: admin, kind: "DOCUMENT", status: "READY", objectKey: `fixture/${documentId}.pdf`, originalName: "fixture.pdf", contentType: "application/pdf", sizeBytes: 4 },
    { id: audioId, ownerId: admin, kind: "AUDIO", status: "READY", objectKey: `ready/audio/${audioId}.mp3`, originalName: "fixture.mp3", contentType: "audio/mpeg", sizeBytes: audio.bytes.length, etag: audio.etag },
  ] });
});
after(async () => {
  if (prisma) {
    await prisma.miniTest.deleteMany({ where: { createdById: learner } });
    await prisma.question.deleteMany({ where: { contributionId: { in: contributions } } });
    await prisma.questionGroup.deleteMany({ where: { contributionId: { in: contributions } } });
    await prisma.authorizationAuditEvent.deleteMany({ where: { actorId: admin } });
    await prisma.contentContribution.deleteMany({ where: { id: { in: contributions } } });
    await prisma.ingestionJob.deleteMany({ where: { id: { in: jobs } } });
    await prisma.uploadedAsset.deleteMany({ where: { OR: [{ ownerId: { in: [admin, foreign] } }, ...contributions.flatMap(id => ["audio", "image"].map(kind => ({ objectKey: { startsWith: `shared/${kind}/${id}/` } })))] } });
    const scopes = ["mobile-upload-intent", "mobile-upload-complete", "mobile-asset-read", "ingestion-image", "contribution-submit", "contribution-review", "mobile-test-create"];
    await prisma.userAiUsage.deleteMany({ where: { OR: scopes.flatMap(scope => [admin, foreign, learner].map(id => ({ key: { endsWith: createHash("sha256").update(`${scope}:${id}`).digest("hex") } }))) } });
    await prisma.user.deleteMany({ where: { id: { in: [admin, foreign, learner] } } });
    await prisma.$disconnect();
  }
  if (storage) await storage.close();
});
async function makeJob() {
  const id = randomUUID(); jobs.push(id);
  await prisma.ingestionJob.create({ data: { id, ownerId: admin, documentAssetId: documentId, audioAssetId: audioId, status: "COMPLETED",
    result: { data: [{ group: { groupType: "AUDIO", audioAssetId: audioId }, questions: [{ part: 1, content: "1.", options: { A: "A", B: "B", C: "C", D: "D" }, correctAnswer: "B" }] }] } } });
  return id;
}
async function submitJob(id: string) {
  const job = await prisma.ingestionJob.findUniqueOrThrow({ where: { id } });
  const response = await submit.POST(await request(admin, { jobId: id, data: job.result, rightsConfirmed: true }));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const body = await response.json(); contributions.push(body.contribution.id); return body.contribution.id as string;
}
describe("listening images through real APIs, PostgreSQL and loopback S3 fixture", () => {
  it("uploads and verifies an image, persists its attachment and reads it back after reopening the job", async () => {
    const response = await upload.POST(await request(admin, { kind: "IMAGE", fileName: "photo.png", contentType: "image/png", sizeBytes: png.length }));
    assert.equal(response.status, 201); const intent = await response.json(); imageId = intent.asset.id;
    assert.equal(new URL(intent.upload.url).origin, storage.endpoint);
    assert.equal((await fetch(intent.upload.url, { method: "PUT", headers: intent.upload.headers, body: png })).status, 200);
    assert.equal((await complete.POST(await request(admin, {}), params(imageId))).status, 200);
    const id = await makeJob();
    assert.equal((await attach.POST(await request(admin, { groupIndex: 0, imageAssetId: imageId }), params(id))).status, 200);
    const reopened = await readJob.GET(await request(admin), params(id));
    assert.equal((await reopened.json()).job.result.data[0].group.imageAssetId, imageId);
    const asset = await prisma.uploadedAsset.findUniqueOrThrow({ where: { id: imageId } });
    assert.equal(asset.ownerId, admin); assert.equal(asset.status, "READY");
    assert.deepEqual(storage.objects.get(asset.objectKey)?.bytes, png);
  });
  it("rejects a document disguised as an image and a different account's image without changing the job", async () => {
    const otherId = randomUUID();
    await prisma.uploadedAsset.create({ data: { id: otherId, ownerId: foreign, kind: "IMAGE", status: "READY", objectKey: `foreign/${otherId}.png`, originalName: "foreign.png", contentType: "image/png", sizeBytes: png.length } });
    const id = await makeJob();
    for (const invalidId of [documentId, otherId]) assert.equal((await attach.POST(await request(admin, { groupIndex: 0, imageAssetId: invalidId }), params(id))).status, 409);
    assert.equal((await attach.POST(await request(foreign, { groupIndex: 0, imageAssetId: imageId }), params(id))).status, 409);
    assert.equal((await attach.POST(await request(learner, { groupIndex: 0, imageAssetId: imageId }), params(id))).status, 403);
    const job = await prisma.ingestionJob.findUniqueOrThrow({ where: { id } });
    assert.ok(!JSON.stringify(job.result).includes("imageAssetId"));
  });
  it("publishes audio and image exactly once under concurrent approval and lets a learner read only shared copies", async () => {
    const id = await makeJob();
    assert.equal((await attach.POST(await request(admin, { groupIndex: 0, imageAssetId: imageId }), params(id))).status, 200);
    const contributionId = await submitJob(id);
    assert.equal((await media.GET(await request(learner), params(contributionId))).status, 403);
    const preview = await media.GET(await request(admin), params(contributionId));
    assert.equal(preview.status, 200); const mediaBody = await preview.json();
    assert.equal(mediaBody.images.length, 1); assert.deepEqual(mediaBody.images[0].groupNumbers, [1]);
    assert.deepEqual(Buffer.from(await (await fetch(mediaBody.images[0].url)).arrayBuffer()), png);
    const statuses = await Promise.all([0, 1].map(async () => (await approve.POST(await request(admin, { decision: "APPROVE" }), params(contributionId))).status));
    assert.deepEqual(statuses.sort(), [200, 409]);
    const published = await prisma.questionGroup.findMany({ where: { contributionId }, include: { imageAsset: true, audioAsset: true } });
    assert.equal(published.length, 1);
    const group = published[0];
    assert.equal(group.imageAsset?.ownerId, null); assert.equal(group.audioAsset?.ownerId, null);
    assert.notEqual(group.imageAssetId, imageId); assert.notEqual(group.audioAssetId, audioId);
    assert.deepEqual(storage.objects.get(group.imageAsset!.objectKey)?.bytes, png);
    assert.equal([...storage.objects.keys()].filter(key => key.includes(`/${contributionId}/`)).length, 2);
    const created = await start.POST(await request(learner, {}), params(group.id));
    assert.equal(created.status, 201); const body = await created.json();
    const test = await readTest.GET(await request(learner), params(body.test.id));
    assert.equal(test.status, 200); const detail = await test.json();
    assert.ok(!JSON.stringify(detail).includes("correctAnswer"));
    assert.deepEqual(Buffer.from(await (await fetch(detail.test.questions[0].question.group.imageUrl)).arrayBuffer()), png);
    assert.equal((await prisma.uploadedAsset.findUniqueOrThrow({ where: { id: imageId } })).ownerId, admin);
  });
  it("rolls back DB publication and cleans up every shared copy if an image is revoked during copying", async () => {
    const id = await makeJob();
    assert.equal((await attach.POST(await request(admin, { groupIndex: 0, imageAssetId: imageId }), params(id))).status, 200);
    const contributionId = await submitJob(id);
    storage.setSharedCopyHook(async () => { storage.setSharedCopyHook(null); await prisma.uploadedAsset.update({ where: { id: imageId }, data: { status: "REJECTED" } }); });
    try {
      const response = await approve.POST(await request(admin, { decision: "APPROVE" }), params(contributionId));
      assert.equal(response.status, 409);
      assert.equal((await prisma.contentContribution.findUniqueOrThrow({ where: { id: contributionId } })).status, "PENDING");
      assert.equal(await prisma.question.count({ where: { contributionId } }), 0);
      assert.equal(await prisma.questionGroup.count({ where: { contributionId } }), 0);
      assert.ok(![...storage.objects.keys()].some(key => key.includes(`/${contributionId}/`)));
      const privateImage = await prisma.uploadedAsset.findUniqueOrThrow({ where: { id: imageId } });
      assert.deepEqual(storage.objects.get(privateImage.objectKey)?.bytes, png);
    } finally { storage.setSharedCopyHook(null); await prisma.uploadedAsset.update({ where: { id: imageId }, data: { status: "READY" } }); }
  });
  it("blocks Part 1 publication without its image before copying any object", async () => {
    const contributionId = await submitJob(await makeJob());
    const writes = storage.requests.filter(request => request.method === "PUT").length;
    assert.equal((await approve.POST(await request(admin, { decision: "APPROVE" }), params(contributionId))).status, 422);
    assert.equal(storage.requests.filter(request => request.method === "PUT").length, writes);
  });
});
