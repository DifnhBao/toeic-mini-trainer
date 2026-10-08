import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import IngestionQuestionReview, { buildReviewedContribution } from "../app/components/IngestionQuestionReview";

it("shows the missing-key warning and disables approval for an unresolved listening draft", () => {
  const html = renderToStaticMarkup(createElement(IngestionQuestionReview, {
    groups: [{ questions: [{ part: 2, content: "Question 7", options: { A: "A", B: "B", C: "C" }, correctAnswer: "" }] }],
    jobId: "00000000-0000-0000-0000-000000000001", pageRange: null,
  }));
  assert.match(html, /Chưa có đáp án từ tài liệu/);
  assert.doesNotMatch(html, /checked=""/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Duyệt câu này/);
});

it("starts with every extracted question awaiting a decision and saving disabled", () => {
  const html = renderToStaticMarkup(createElement(IngestionQuestionReview, {
    groups: [{ questions: [{
      part: 5,
      content: "She feels _____ today.",
      options: { A: "relaxing", B: "relaxed" },
      correctAnswer: "A",
    }] }],
    jobId: "00000000-0000-0000-0000-000000000001",
    pageRange: { start: 1, end: 1 },
  }));
  assert.match(html, /Sửa và duyệt từng câu/);
  assert.match(html, /1 chưa duyệt/);
  assert.match(html, /aria-label="Đáp án đúng B"/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Lưu 0 câu đã duyệt<\/button>/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Chuyển 0 câu sang bước xuất bản<\/button>/);
});

it("submits only approved edited questions and strips legacy media URLs", () => {
  const result = buildReviewedContribution([
    {
      group: { groupType: "AUDIO", audioUrl: "/uploads/legacy.mp3", audioAssetId: "00000000-0000-0000-0000-000000000002" },
      questions: [
        { part: 3, content: "Original one", options: { A: "yes", B: "no" }, correctAnswer: "A" },
        { part: 3, content: "Original two", options: { A: "yes", B: "no" }, correctAnswer: "A" },
      ],
    },
  ], [
    { groupIndex: 0, questionIndex: 0, decision: "APPROVE", question: { part: 3, content: " Edited one ", options: { A: " answer A ", B: " answer B " }, correctAnswer: "B" } },
    { groupIndex: 0, questionIndex: 1, decision: "SKIP", question: { part: 3, content: "Original two", options: { A: "yes", B: "no" }, correctAnswer: "A" } },
  ]);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].questions.length, 1);
  assert.equal(result.data[0].questions[0].content, "Edited one");
  assert.equal(result.data[0].questions[0].correctAnswer, "B");
  assert.equal(result.data[0].group?.audioUrl, null);
  assert.equal(result.data[0].group?.audioAssetId, "00000000-0000-0000-0000-000000000002");
});
