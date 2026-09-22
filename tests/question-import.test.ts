import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractedDataSchema } from "../app/lib/question-import";

const validQuestion = {
  part: 5,
  content: "The report ___ ready.",
  options: { A: "is", B: "are", C: "be", D: "being" },
  correctAnswer: "A",
};

describe("question import schema", () => {
  it("accepts a bounded TOEIC question", () => {
    const parsed = extractedDataSchema.parse({ data: [{ questions: [validQuestion] }] });
    assert.equal(parsed.data[0].questions[0].correctAnswer, "A");
  });

  it("rejects an answer key that is absent from options", () => {
    const result = extractedDataSchema.safeParse({
      data: [{ questions: [{ ...validQuestion, options: { B: "are", C: "be" } }] }],
    });
    assert.equal(result.success, false);
  });

  it("rejects a question with fewer than two answer options", () => {
    const result = extractedDataSchema.safeParse({
      data: [{ questions: [{ ...validQuestion, options: { A: "is" } }] }],
    });
    assert.equal(result.success, false);
  });

  it("rejects external legacy media URLs", () => {
    const result = extractedDataSchema.safeParse({
      data: [{ group: { groupType: "AUDIO", audioUrl: "https://evil.example/file.mp3" }, questions: [validQuestion] }],
    });
    assert.equal(result.success, false);
  });

  it("accepts an owner-validated asset reference shape", () => {
    const result = extractedDataSchema.safeParse({
      data: [{
        group: {
          groupType: "AUDIO",
          audioAssetId: "00000000-0000-4000-8000-000000000001",
        },
        questions: [{ ...validQuestion, part: 3 }],
      }],
    });
    assert.equal(result.success, true);
  });
});
