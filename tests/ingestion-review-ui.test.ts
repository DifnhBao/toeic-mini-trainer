import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import IngestionQuestionReview from "../app/components/IngestionQuestionReview";

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
});
