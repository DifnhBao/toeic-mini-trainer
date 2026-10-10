import assert from "node:assert/strict";
import { test } from "node:test";
import { detectListeningCues, proposeFromCues, type TimedWord } from "../scripts/lib/listening-cues.mts";

function phrase(text: string, start: number, probability = 0.95): TimedWord[] {
  return text.split(" ").map((text, index) => ({ text, start: start + index * 0.15, end: start + (index + 1) * 0.15, probability }));
}

test("automatically proposes 54 unreviewed clips, excluding directions and repeated picture numbers", () => {
  const words = [...phrase("Part one", 0)];
  for (let n = 1; n <= 6; n++) {
    words.push(...phrase(`Number ${n}`, 10 + (n - 1) * 20));
    words.push(...phrase(`Look at the picture marked number ${n}`, 12 + (n - 1) * 20));
  }
  words.push(...phrase("Part two", 140), ...phrase("Now let us begin with question number seven", 150));
  for (let n = 7; n <= 31; n++) words.push(...phrase(`Number ${n}`, 160 + (n - 7) * 10));
  words.push(...phrase("Part three", 420));
  for (let n = 32; n <= 68; n += 3) {
    const range = n % 2 ? `Questions ${n}-${n + 2} refer to the following conversation` : `Questions ${n} through ${n + 2} refer to the following conversation`;
    words.push(...phrase(range, 450 + ((n - 32) / 3) * 80));
    // ASR can render an inner question as "3."; Part boundaries prevent
    // counting this as a duplicate of Part 1 question 3.
    words.push({ text: "3.", start: 460 + ((n - 32) / 3) * 80, end: 461 + ((n - 32) / 3) * 80, probability: 0.2, standaloneNumber: true });
  }
  words.push(...phrase("Part four", 1495));
  for (let n = 71; n <= 98; n += 3) words.push(...phrase(`Questions ${n} to ${n + 2} refer to the following talk`, 1520 + ((n - 71) / 3) * 95));
  words.push(...phrase("This is the end of the listening section", 2500));
  const result = detectListeningCues(words, 2600, true);
  assert.equal(result.candidates.length, 54); assert.equal(result.unresolved.length, 0);
  assert.ok(result.candidates.every(item => item.segment.reviewed === false));
  assert.equal(result.candidates[5].segment.end, 139.8);
  assert.equal(result.candidates[6].segment.start, 159.8);
  assert.equal(result.candidates[30].segment.end, 419.8);
  assert.equal(result.candidates.at(-1)!.segment.end, 2499.8);
});

test("handles spoken/hyphenated numbers, split numeric ranges and standalone digit announcements", () => {
  const words = [...phrase("Number one", 10), { text: "2.", start: 30, end: 31, probability: 0.9, standaloneNumber: true },
    ...phrase("Number three", 50), ...phrase("Part three", 70), ...phrase("Questions thirty-two through thirty-four", 80),
    ...phrase("Questions 35 -37 refer", 150), ...phrase("Questions thirty eight and forty refer", 220)];
  const result = detectListeningCues(words, 300, false);
  assert.ok(result.candidates.some(item => item.segment.first === 1));
  assert.ok(result.candidates.some(item => item.segment.first === 2));
  assert.ok(result.candidates.some(item => item.segment.first === 32 && item.segment.last === 34));
  assert.ok(result.candidates.some(item => item.segment.first === 35 && item.segment.last === 37));
  assert.ok(result.unresolved.some(item => item.first === 38));
});

test("missing or ambiguous cues remain unresolved and low probability is flagged for review", () => {
  const words = [...phrase("Number one", 10, 0.2), ...phrase("Number two", 30), ...phrase("Number three", 50), ...phrase("Number three", 65)];
  const result = detectListeningCues(words, 100, false);
  assert.ok(result.candidates[0].warnings.some(value => value.includes("độ tin cậy thấp")));
  assert.ok(result.unresolved.some(item => item.first === 2 && item.reason.includes("kết thúc")));
  assert.ok(result.unresolved.some(item => item.first === 3 && item.reason.includes("Nhiều mốc")));
  assert.ok(result.unresolved.some(item => item.first === 98));
  assert.equal(detectListeningCues([], 100, false).candidates.length, 0);
});

test("merges overlapping chunk alternatives without losing range announcements or accepting stray part numbers", () => {
  const first = detectListeningCues([...phrase("Questions 32 through 34", 118), ...phrase("Questions 35 through 37", 195)], 300, false);
  const second = detectListeningCues([...phrase("Questions 35 -37", 195.4), ...phrase("Questions 38 through 40", 260),
    { text: "3.", start: 270, end: 271, probability: 0.9, standaloneNumber: true }], 300, false);
  const merged = proposeFromCues([...first.cues, ...second.cues], { 3: 100 }, 300, false, null);
  assert.equal(merged.cues.filter(cue => cue.first === 35).length, 1);
  assert.equal(merged.cues.filter(cue => cue.first === 3).length, 0);
  assert.ok(merged.candidates.some(item => item.segment.first === 32));
  assert.ok(merged.candidates.some(item => item.segment.first === 35));
});
