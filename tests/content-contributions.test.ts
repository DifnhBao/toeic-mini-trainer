import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contributionQuestionCount,
  reviewContributionSchema,
  submitContributionSchema,
} from "../app/lib/content-contributions";
import { hasRole } from "../app/lib/authorization";
import { canReadMediaAsset } from "../app/lib/object-storage";

const jobId = "00000000-0000-4000-8000-000000000001";
const data = {
  data: [{
    questions: [{ part: 5, content: "The report ___ ready.", options: { A: "is", B: "are" }, correctAnswer: "A" }],
  }],
};

describe("moderated contributions", () => {
  it("requires explicit rights confirmation", () => {
    assert.equal(submitContributionSchema.safeParse({ jobId, data }).success, false);
    assert.equal(submitContributionSchema.safeParse({ jobId, data, rightsConfirmed: false }).success, false);
    assert.equal(submitContributionSchema.safeParse({ jobId, data, rightsConfirmed: true }).success, true);
  });

  it("rejects local or external media paths before sharing", () => {
    const unsafeData = {
      data: [{ ...data.data[0], group: { groupType: "AUDIO", audioUrl: "/uploads/private.mp3" } }],
    };
    assert.equal(submitContributionSchema.safeParse({ jobId, data: unsafeData, rightsConfirmed: true }).success, false);
  });

  it("uses the current database role and account status", () => {
    const actor = { id: "user", role: "REVIEWER" as const, status: "ACTIVE" as const };
    assert.equal(hasRole(actor, "REVIEWER"), true);
    assert.equal(hasRole({ ...actor, status: "SUSPENDED" }, "REVIEWER"), false);
    assert.equal(hasRole({ ...actor, role: "USER" }, "REVIEWER"), false);
  });

  it("requires a reason for rejection and counts submitted questions", () => {
    assert.equal(reviewContributionSchema.safeParse({ decision: "REJECT", note: "bad" }).success, false);
    assert.equal(reviewContributionSchema.safeParse({ decision: "REJECT", note: "Đáp án sai" }).success, true);
    assert.equal(contributionQuestionCount(submitContributionSchema.parse({ jobId, data, rightsConfirmed: true }).data), 1);
  });

  it("keeps pending and rejected media private", () => {
    const asset = { status: "READY", ownerId: "owner" };
    assert.equal(canReadMediaAsset(asset, "reader", false), false);
    assert.equal(canReadMediaAsset(asset, "reader", true), true);
    assert.equal(canReadMediaAsset({ ...asset, status: "PENDING" }, "reader", true), false);
    assert.equal(canReadMediaAsset(asset, "owner", false), true);
    assert.equal(canReadMediaAsset({ status: "READY", ownerId: null }, "reader", false), true);
  });
});
