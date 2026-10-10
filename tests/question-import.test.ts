import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractedDataSchema, extractionDraftSchema, generatedQuestionsSchema } from "../app/lib/question-import";

const validQuestion = {
  part: 5,
  content: "The report ___ ready.",
  options: { A: "is", B: "are", C: "be", D: "being" },
  correctAnswer: "A",
};

describe("question import schema", () => {
  it("accepts an unresolved listening draft but never accepts it for persistence", () => {
    const source = { data: [{ questions: [{ ...validQuestion, part: 2, options: { A: "A", B: "B", C: "C" }, correctAnswer: "" }] }] };
    assert.equal(generatedQuestionsSchema.safeParse(source).success, true);
    assert.equal(extractionDraftSchema.safeParse(source).success, true);
    assert.equal(extractedDataSchema.safeParse(source).success, false);
    source.data[0].questions[0].correctAnswer = "C";
    assert.equal(extractedDataSchema.safeParse(source).success, true);
  });
  it("rejects fabricated Part 2 option D and missing options in other generated Parts", () => {
    assert.equal(generatedQuestionsSchema.safeParse({ data: [{ questions: [{ ...validQuestion, part: 2 }] }] }).success, false);
    assert.equal(generatedQuestionsSchema.safeParse({ data: [{ questions: [{ ...validQuestion, part: 3, options: { A: "A", B: "B", C: "C" } }] }] }).success, false);
  });
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
