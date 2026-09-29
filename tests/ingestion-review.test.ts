import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReviewedImport, InvalidIngestionReviewError } from "../app/lib/ingestion-review";

const first = { part: 5, content: "Customer _____ matters.", options: { A: "happy", B: "happiness" }, correctAnswer: "B" };
const second = { part: 5, content: "She feels _____ today.", options: { A: "relaxing", B: "relaxed" }, correctAnswer: "A" };
const source = { data: [{ group: { groupType: "TEXT" }, questions: [first, second] }] };

describe("reviewed ingestion import", () => {
  it("imports only approved edits while preserving source group context", () => {
    const result = buildReviewedImport(source, { reviews: [
      { groupIndex: 0, questionIndex: 0, decision: "SKIP" },
      { groupIndex: 0, questionIndex: 1, decision: "APPROVE", question: { ...second, correctAnswer: "B" } },
    ] });
    assert.deepEqual(result.data[0].group, source.data[0].group);
    assert.deepEqual(result.data[0].questions, [{ ...second, correctAnswer: "B" }]);
  });

  it("requires a decision for every original question", () => {
    assert.throws(() => buildReviewedImport(source, { reviews: [
      { groupIndex: 0, questionIndex: 0, decision: "APPROVE", question: first },
    ] }), InvalidIngestionReviewError);
  });

  it("rejects duplicate and out-of-range decisions", () => {
    const approve = { groupIndex: 0, questionIndex: 0, decision: "APPROVE", question: first };
    assert.throws(() => buildReviewedImport(source, { reviews: [approve, approve] }), InvalidIngestionReviewError);
    assert.throws(() => buildReviewedImport(source, { reviews: [approve, { groupIndex: 0, questionIndex: 2, decision: "SKIP" }] }), InvalidIngestionReviewError);
  });

  it("rejects invalid edited answers and an all-skipped import", () => {
    assert.throws(() => buildReviewedImport(source, { reviews: [
      { groupIndex: 0, questionIndex: 0, decision: "APPROVE", question: { ...first, correctAnswer: "C" } },
      { groupIndex: 0, questionIndex: 1, decision: "SKIP" },
    ] }), InvalidIngestionReviewError);
    assert.throws(() => buildReviewedImport(source, { reviews: [
      { groupIndex: 0, questionIndex: 0, decision: "SKIP" },
      { groupIndex: 0, questionIndex: 1, decision: "SKIP" },
    ] }), InvalidIngestionReviewError);
    assert.throws(() => buildReviewedImport(source, { reviews: [
      { groupIndex: 0, questionIndex: 0, decision: "APPROVE", question: { ...first, content: "" } },
      { groupIndex: 0, questionIndex: 1, decision: "SKIP" },
    ] }), InvalidIngestionReviewError);
  });
});
