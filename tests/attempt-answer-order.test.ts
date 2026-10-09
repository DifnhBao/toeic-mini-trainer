import assert from "node:assert/strict";
import { test } from "node:test";
import { orderAttemptAnswers } from "../app/lib/attempt-answer-order";

test("review keeps question order, legacy unmatched answers and the original input", () => {
  const answers = Object.freeze([
    { id: "answer-a", question: { id: "missing-1" } },
    { id: "answer-b", question: { id: "q2" } },
    { id: "answer-c", question: { id: "missing-2" } },
    { id: "answer-d", question: { id: "q1" } },
  ]);
  const links = Object.freeze([{ questionId: "q2", orderIndex: 2 }, { questionId: "q1", orderIndex: 1 }]);
  assert.deepEqual(orderAttemptAnswers(answers, links).map(answer => answer.id), ["answer-d", "answer-b", "answer-a", "answer-c"]);
  assert.deepEqual(answers.map(answer => answer.id), ["answer-a", "answer-b", "answer-c", "answer-d"]);
  assert.deepEqual(orderAttemptAnswers(answers, []), answers);
});
