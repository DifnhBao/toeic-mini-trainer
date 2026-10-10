import assert from "node:assert/strict";
import { test } from "node:test";
import { questionPublicationIssue, type PublicationCandidate } from "../app/lib/question-publication";

function candidate(patch: Partial<PublicationCandidate> = {}): PublicationCandidate {
  return { part: 5, content: "The sample ___ ready.", options: { A: "is", B: "are" }, correctAnswer: "A",
    contentRevision: 1, publicationStatus: "LEGACY", groupId: null, group: null, ...patch };
}
function group(patch: Partial<NonNullable<PublicationCandidate["group"]>> = {}) {
  return { ownerId: null, passageText: null, audioAssetId: "audio", imageAssetId: "image", audioUrl: null, imageUrl: null,
    contribution: { status: "APPROVED" as const },
    audioAsset: { ownerId: null, kind: "AUDIO" as const, status: "READY" as const },
    imageAsset: { ownerId: null, kind: "IMAGE" as const, status: "READY" as const }, ...patch };
}

test("publication validates legacy content, answer membership and supported options", () => {
  assert.equal(questionPublicationIssue(candidate()), null);
  for (const patch of [{ part: 0 }, { part: 8 }, { part: 1.5 }, { correctAnswer: "D" }, { correctAnswer: "a" },
    { options: ["yes", "no"] }, { options: { A: "yes" } }, { options: { A: "yes", B: " " } },
    { options: { A: "yes", E: "no" } }, { content: null }, { content: " " }, { content: "x".repeat(10_001) }]) {
    assert.equal(questionPublicationIssue(candidate(patch))?.code, "INVALID_CONTENT", JSON.stringify(patch));
  }
});

test("listening requires shared audio and Part 1 additionally requires a photo", () => {
  for (const part of [1, 2, 3, 4]) assert.equal(questionPublicationIssue(candidate({ part }))?.code, "MEDIA_REQUIRED");
  assert.equal(questionPublicationIssue(candidate({ part: 1, content: null, group: group() })), null);
  assert.equal(questionPublicationIssue(candidate({ part: 2, content: null, group: group({ imageAssetId: null, imageAsset: null }) })), null);
  assert.equal(questionPublicationIssue(candidate({ part: 1, group: group({ imageAssetId: null, imageAsset: null }) }))?.code, "MEDIA_REQUIRED");
});

test("approval does not make legacy URLs, foreign media or failed assets publishable", () => {
  for (const patch of [{ ownerId: "private-owner" }, { audioUrl: "/uploads/private.mp3" }, { imageUrl: "/uploads/private.png" },
    { contribution: null }, { contribution: { status: "REJECTED" as const } }]) {
    assert.equal(questionPublicationIssue(candidate({ part: 1, group: group(patch) }))?.code, "MEDIA_REVIEW_REQUIRED");
  }
  for (const audioAsset of [null, { ownerId: "private-owner", kind: "AUDIO" as const, status: "READY" as const },
    { ownerId: null, kind: "IMAGE" as const, status: "READY" as const }, { ownerId: null, kind: "AUDIO" as const, status: "REJECTED" as const }]) {
    assert.equal(questionPublicationIssue(candidate({ part: 1, group: group({ audioAsset }) }))?.code, "MEDIA_UNAVAILABLE");
  }
  assert.equal(questionPublicationIssue(candidate({ part: 5, group: group({ imageAsset: null }) }))?.code, "MEDIA_UNAVAILABLE");
});

test("reading requires actual passage text, including HTML-only and whitespace cases", () => {
  for (const part of [6, 7]) {
    for (const passageText of [null, " ", "<p><br></p>", "<script>hidden</script>", "<p>&nbsp;</p>"]) {
      assert.equal(questionPublicationIssue(candidate({ part, group: group({ passageText }) }))?.code, "PASSAGE_REQUIRED");
    }
    assert.equal(questionPublicationIssue(candidate({ part, group: group({ passageText: "<p>A sample passage.</p>" }) })), null);
  }
});
