import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canReadOwned, canReadQuestion, hasRole } from "../app/lib/authorization";
import { canonicalExplanationSchema, formatCanonicalExplanation } from "../app/lib/explanation-cache";
import { createGuestChallenge, guestDailyLimit, guestQuotaKey, verifyGuestChallenge } from "../app/lib/guest-tests";

const owner = { id: "owner", role: "USER" as const, status: "ACTIVE" as const };
const reviewer = { id: "reviewer", role: "REVIEWER" as const, status: "ACTIVE" as const };
const admin = { id: "admin", role: "ADMIN" as const, status: "ACTIVE" as const };

describe("role and publication policy", () => {
  it("keeps suspended accounts out of every authenticated role", () => {
    assert.equal(hasRole(admin, "ADMIN"), true);
    assert.equal(hasRole(reviewer, "REVIEWER"), true);
    assert.equal(hasRole(owner, "REVIEWER"), false);
    assert.equal(hasRole({ ...admin, status: "SUSPENDED" }, "USER"), false);
  });

  it("only exposes published questions to guests", () => {
    assert.equal(canReadQuestion(null, { ownerId: null, publicationStatus: "PUBLISHED" }), true);
    assert.equal(canReadQuestion(null, { ownerId: null, publicationStatus: "LEGACY" }), false);
    assert.equal(canReadQuestion(null, { ownerId: "owner", publicationStatus: "PRIVATE" }), false);
    assert.equal(canReadQuestion(owner, { ownerId: "owner", publicationStatus: "PRIVATE" }), true);
    assert.equal(canReadQuestion(reviewer, { ownerId: "owner", publicationStatus: "PRIVATE" }), false);
    assert.equal(canReadQuestion(owner, { ownerId: null, publicationStatus: "LEGACY" }), true);
    assert.equal(canReadQuestion(null, { ownerId: null, publicationStatus: "ARCHIVED" }), false);
    assert.equal(canReadOwned({ ...owner, status: "SUSPENDED" }, "owner"), false);
  });
});

describe("anonymous challenge", () => {
  it("binds question IDs to a signed, expiring token", async () => {
    process.env.GUEST_TEST_SECRET = "unit-test-guest-secret-at-least-32-characters";
    const ids = ["00000000-0000-4000-8000-000000000001"];
    const token = await createGuestChallenge(ids);
    assert.deepEqual(await verifyGuestChallenge(token), ids);
    const segments = token.split(".");
    segments[2] = `${segments[2][0] === "A" ? "B" : "A"}${segments[2].slice(1)}`;
    await assert.rejects(verifyGuestChallenge(segments.join(".")));
  });

  it("uses a day-scoped opaque usage key", () => {
    process.env.GUEST_TEST_SECRET = "unit-test-guest-secret-at-least-32-characters";
    const request = new Request("https://example.test", { headers: { "x-real-ip": "203.0.113.9" } });
    const first = guestQuotaKey(request, new Date("2026-09-28T10:00:00Z"));
    assert.equal(first, guestQuotaKey(request, new Date("2026-09-28T20:00:00Z")));
    assert.notEqual(first, guestQuotaKey(request, new Date("2026-09-29T10:00:00Z")));
    assert.equal(guestDailyLimit(), 3);
  });
});

describe("canonical explanation", () => {
  it("formats a shared explanation for the user's chosen wrong answer", () => {
    const explanation = canonicalExplanationSchema.parse({
      correctReason: "Chủ ngữ số ít dùng is.", optionA: "", optionB: "Are dùng cho số nhiều.",
      optionC: "Thiếu chia động từ.", optionD: "Không phù hợp thì.", memoryTip: "Nhìn chủ ngữ trước.",
    });
    assert.match(formatCanonicalExplanation(explanation, "A", "B"), /Are dùng cho số nhiều/);
    assert.match(formatCanonicalExplanation(explanation, "A", "C"), /Thiếu chia động từ/);
    assert.equal(canonicalExplanationSchema.safeParse({ ...explanation, extra: "private" }).success, false);
  });
});
