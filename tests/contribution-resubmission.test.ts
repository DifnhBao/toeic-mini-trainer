import assert from "node:assert/strict";
import { afterEach, before, mock, test } from "node:test";
import type { PrismaClient, Prisma } from "@prisma/client";
import { SignJWT } from "jose";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import IngestionQuestionReview from "../app/components/IngestionQuestionReview";
let submitContributionSchema: typeof import("../app/lib/content-contributions")["submitContributionSchema"];
let reviewContributionSchema: typeof import("../app/lib/content-contributions")["reviewContributionSchema"];

const jobId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const stamp = new Date("2026-10-09T01:00:00.000Z");
const key = "local-resubmission-jwt-secret-0000000000000000";
const data = { data: [{ questions: [{ part: 5, content: "Edited question", options: { A: "yes", B: "no" }, correctAnswer: "B" }] }] };
const version = { contributionId: id, expectedUpdatedAt: stamp.toISOString() };
let submit: typeof import("../app/api/v1/contributions/route");
let review: typeof import("../app/api/v1/contributions/[id]/review/route");
let prisma: PrismaClient;
const fail = async () => { throw new Error("Unexpected DB call; real DB/provider forbidden"); };
before(async () => {
  process.env.MOBILE_JWT_SECRET = key;
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/toeic_release_test";
  (globalThis as typeof globalThis & { prisma: PrismaClient }).prisma = {
    user: { findUnique: fail }, ingestionJob: { findFirst: fail, updateMany: fail },
    contentContribution: { findUnique: fail, create: fail, updateMany: fail },
    authorizationAuditEvent: { create: fail }, uploadedAsset: { count: fail }, $transaction: fail,
  } as unknown as PrismaClient;
  prisma = (await import("../app/lib/prisma")).prisma;
  ({ submitContributionSchema, reviewContributionSchema } = await import("../app/lib/content-contributions"));
  submit = await import("../app/api/v1/contributions/route");
  review = await import("../app/api/v1/contributions/[id]/review/route");
});
afterEach(() => {
  mock.restoreAll();
  (globalThis as typeof globalThis & { mobileAuthRateBuckets?: Map<string, unknown> }).mobileAuthRateBuckets?.clear();
});

async function request(body: unknown) {
  const token = await new SignJWT({ tokenUse: "access" }).setProtectedHeader({ alg: "HS256" })
    .setSubject("owner").setIssuer("toeic-mini-trainer").setAudience("toeic-mobile").setExpirationTime("5m")
    .sign(new TextEncoder().encode(key));
  return new Request("https://local.invalid/api/v1/contributions", { method: "POST", headers: {
    authorization: `Bearer ${token}`, "content-type": "application/json",
  }, body: JSON.stringify(body) });
}
function fixture(status = "REJECTED", ownerId = "owner") {
  const row = { id, ownerId, status, data, createdAt: stamp, updatedAt: stamp, reviewedAt: stamp as Date | null, sourceJob: { result: data, audioAssetId: null } };
  mock.method(prisma.user, "findUnique", async () => ({ id: "owner", role: "ADMIN", status: "ACTIVE" }));
  mock.method(prisma.ingestionJob, "findFirst", async () => ({ id: jobId, audioAssetId: null, result: data, updatedAt: stamp }));
  mock.method(prisma.contentContribution, "findUnique", async () => row);
  const lock = mock.method(prisma.ingestionJob, "updateMany", async () => ({ count: 1 }));
  const write = mock.method(prisma.contentContribution, "updateMany", async () => ({ count: 1 }));
  const audit = mock.method(prisma.authorizationAuditEvent, "create", async () => ({}));
  mock.method(prisma, "$transaction", async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => callback(prisma as unknown as Prisma.TransactionClient));
  return { row, lock, write, audit };
}

test("resubmission requires an explicit version and fresh sharing confirmation", () => {
  const body = { jobId, data, rightsConfirmed: true, resubmission: version };
  assert.equal(submitContributionSchema.safeParse(body).success, true);
  assert.equal(submitContributionSchema.safeParse({ ...body, rightsConfirmed: false }).success, false);
  for (const value of [{ contributionId: id }, { ...version, expectedUpdatedAt: "yesterday" }, { ...version, publish: true }]) {
    assert.equal(submitContributionSchema.safeParse({ ...body, resubmission: value }).success, false);
  }
  assert.equal(reviewContributionSchema.safeParse({ decision: "APPROVE", expectedUpdatedAt: "stale" }).success, false);
});

test("only the owner's exact rejected version can be resubmitted", async () => {
  for (const [status, owner] of [["PENDING", "owner"], ["APPROVED", "owner"], ["REJECTED", "other"]]) {
    const f = fixture(status, owner);
    const response = await submit.POST(await request({ jobId, data, rightsConfirmed: true, resubmission: version }));
    assert.equal(response.status, 409); assert.equal(f.write.mock.callCount(), 0); assert.equal(f.lock.mock.callCount(), 0);
    mock.restoreAll();
  }
  const f = fixture();
  for (const resubmission of [{ ...version, expectedUpdatedAt: new Date(stamp.getTime() - 1).toISOString() }, { ...version, contributionId: jobId }]) {
    assert.equal((await submit.POST(await request({ jobId, data, rightsConfirmed: true, resubmission }))).status, 409);
  }
  assert.equal(f.write.mock.callCount(), 0);
});

test("resubmission stores edited data once, returns to pending and keeps an audit trail", async () => {
  const f = fixture();
  const created = mock.method(prisma.contentContribution, "create", fail);
  const network = mock.method(globalThis, "fetch", fail);
  const response = await submit.POST(await request({ jobId, data, rightsConfirmed: true, resubmission: version }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).contribution.id, id);
  const args = f.write.mock.calls[0].arguments[0]!;
  assert.deepEqual(args.where, { id, ownerId: "owner", status: "REJECTED", updatedAt: stamp });
  assert.deepEqual(JSON.parse(JSON.stringify(args.data?.data)), data); assert.equal(args.data?.status, "PENDING");
  assert.equal(args.data?.reviewNote, null); assert.equal(args.data?.reviewedAt, stamp);
  assert.ok((args.data?.updatedAt as Date).getTime() > stamp.getTime());
  assert.equal(f.audit.mock.calls[0].arguments[0]?.data.action, "CONTRIBUTION_RESUBMITTED");
  assert.equal(created.mock.callCount(), 0); assert.equal(network.mock.callCount(), 0);
});

test("a changed job or rejected row never overwrites the new state", async () => {
  const f = fixture();
  mock.method(prisma.ingestionJob, "updateMany", async () => ({ count: 0 }));
  assert.equal((await submit.POST(await request({ jobId, data, rightsConfirmed: true, resubmission: version }))).status, 409);
  assert.equal(f.write.mock.callCount(), 0); assert.equal(f.audit.mock.callCount(), 0);
  mock.restoreAll(); const second = fixture();
  mock.method(prisma.contentContribution, "updateMany", async () => ({ count: 0 }));
  const response = await submit.POST(await request({ jobId, data, rightsConfirmed: true, resubmission: version }));
  assert.equal(response.status, 409); assert.equal(second.audit.mock.callCount(), 0);
});

test("old or versionless review cannot approve or reject resubmitted content", async () => {
  const f = fixture("PENDING");
  for (const decision of ["APPROVE", "REJECT"]) {
    for (const expectedUpdatedAt of [undefined, new Date(stamp.getTime() - 1).toISOString()]) {
      const response = await review.POST(await request({ decision, note: "Wrong answer", ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) }), { params: Promise.resolve({ id }) });
      assert.equal(response.status, 409); assert.equal((await response.json()).error.code, "CONTRIBUTION_CHANGED");
    }
  }
  assert.equal(f.write.mock.callCount(), 0); assert.equal(f.audit.mock.callCount(), 0);
});

test("a current rejection compares the row version inside the transaction", async () => {
  const f = fixture("PENDING");
  const response = await review.POST(await request({ decision: "REJECT", note: "Wrong answer", expectedUpdatedAt: stamp.toISOString() }), { params: Promise.resolve({ id }) });
  assert.equal(response.status, 200);
  assert.deepEqual(f.write.mock.calls[0].arguments[0]?.where, { id, status: "PENDING", updatedAt: stamp });
  assert.equal(f.audit.mock.calls[0].arguments[0]?.data.action, "CONTRIBUTION_REJECTED");
});

test("legacy first-submission reviews remain supported but use a version predicate", async () => {
  const f = fixture("PENDING");
  f.row.reviewedAt = null;
  assert.equal((await review.POST(await request({ decision: "REJECT", note: "Wrong answer" }), { params: Promise.resolve({ id }) })).status, 200);
  assert.deepEqual(f.write.mock.calls[0].arguments[0]?.where, { id, status: "PENDING", updatedAt: stamp });
});

test("resubmission starts with prior corrections, fresh decisions and unchecked rights", () => {
  const html = renderToStaticMarkup(createElement(IngestionQuestionReview, {
    groups: data.data, jobId, pageRange: null, forSharedLibrary: true, resubmission: version,
  }));
  assert.match(html, /Edited question/); assert.match(html, /Sửa bộ câu hỏi bị từ chối/);
  assert.match(html, /1 chưa duyệt/); assert.match(html, /Gửi lại 0 câu để duyệt/);
  const checkbox = html.match(/<input type="checkbox"[^>]*>/)?.[0];
  assert.ok(checkbox); assert.doesNotMatch(checkbox, /checked|disabled/);
  const mediaInputs = html.match(/<input type="file"[^>]*>/g) ?? [];
  assert.ok(mediaInputs.length); for (const input of mediaInputs) assert.match(input, /disabled/);
});
