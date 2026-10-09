import { listeningGroups, validateSegment, type Segment } from "./listening-segments.mts";

export type TimedWord = { text: string; start: number; end: number; probability: number; standaloneNumber?: boolean };
type Token = TimedWord & { text: string; sourceText: string };
export type Cue = { first: number; last: number; start: number; end: number; probability: number; kind: "NUMBER" | "RANGE" };
const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

function numberAt(tokens: Token[], index: number) {
  const word = tokens[index]?.text;
  if (!word) return null;
  if (/^\d{1,3}$/.test(word)) return { value: Number(word), after: index + 1 };
  let value = SMALL.indexOf(word), after = index + 1;
  if (value < 0) {
    if (!TENS[word]) return null;
    value = TENS[word];
    const units = SMALL.indexOf(tokens[after]?.text);
    if (units > 0 && units < 10) { value += units; after++; }
  } else if (value === 1 && tokens[after]?.text === "hundred") { value = 100; after++; }
  return { value, after };
}

export function detectListeningCues(words: TimedWord[], duration: number, complete: boolean) {
  const tokens: Token[] = words.flatMap(word => word.text.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter(Boolean).map(text => ({ ...word, text, sourceText: word.text })))
    .filter(word => Number.isFinite(word.start) && word.start >= 0 && word.end >= word.start && word.end <= duration + 0.1)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  // Merge transcription overlap duplicates before interpreting multiword cues.
  const unique = tokens.filter((token, index) => !tokens.slice(Math.max(0, index - 20), index).some(prior => prior.text === token.text && prior.sourceText === token.sourceText && Math.abs(prior.start - token.start) < 0.03));
  const cues: Cue[] = [], partStarts = new Map<number, number>();
  let listeningEnd: number | null = null;
  for (let i = 0; i < unique.length; i++) {
    const token = unique[i];
    if (token.text === "part") {
      const part = numberAt(unique, i + 1)?.value;
      if (part && part >= 1 && part <= 5 && !partStarts.has(part)) partStarts.set(part, token.start);
      if (part === 5) listeningEnd ??= token.start;
    }
    if (unique.slice(i, i + 10).map(word => word.text).join(" ").startsWith("this is the end of the listening")) listeningEnd ??= token.start;
    const bareNumber = Boolean(token.standaloneNumber);
    if (!bareNumber && !["number", "numbers", "question", "questions"].includes(token.text)) continue;
    // Part 1 repeats the number inside "picture marked number ...". Part 2
    // instructions also mention "begin with question number seven". Neither
    // is an actual announcement boundary.
    if (!bareNumber && (unique[i - 1]?.text === "marked" || (unique[i - 1]?.text === "question" && unique.slice(Math.max(0, i - 8), i).some(word => ["begin", "example"].includes(word.text))))) continue;
    const first = numberAt(unique, bareNumber ? i : i + 1);
    if (!first || first.value < 1 || first.value > 100) continue;
    let last = first.value, after = first.after;
    const hyphenRange = /^\s*\d{1,3}[-–]\d{1,3}[.,:]?\s*$/.test(unique[first.after - 1].sourceText);
    const splitHyphen = /^\s*[-–]\d{1,3}[.,:]?\s*$/.test(unique[after]?.sourceText || "");
    const range = ["through", "to", "and"].includes(unique[after]?.text) ? numberAt(unique, after + 1) : hyphenRange || splitHyphen ? numberAt(unique, after) : null;
    if (range) { last = range.value; after = range.after; }
    if (unique[after - 1].end - token.start > 8) continue;
    const validRange = listeningGroups().some(group => group.part >= 3 && group.first === first.value && group.last === last);
    const validNumber = (bareNumber || token.text === "number") && first.value <= 31 && last === first.value;
    if (!validRange && !validNumber) continue;
    const probability = Math.min(...unique.slice(i, after).map(word => word.probability));
    const cue: Cue = { first: first.value, last, start: token.start, end: unique[after - 1].end, probability, kind: validRange ? "RANGE" : "NUMBER" };
    const duplicate = cues.find(existing => existing.first === cue.first && Math.abs(existing.start - cue.start) < 1);
    if (!duplicate) cues.push(cue);
  }
  return proposeFromCues(cues, Object.fromEntries(partStarts), duration, complete, listeningEnd);
}

export function proposeFromCues(input: Cue[], starts: Record<number, number>, duration: number, complete: boolean, listeningEnd: number | null) {
  const partStarts = new Map(Object.entries(starts).map(([part, start]) => [Number(part), start]));
  const cues: Cue[] = [];
  for (const cue of input.toSorted((a, b) => a.start - b.start)) {
    const duplicate = cues.find(existing => existing.first === cue.first && existing.last === cue.last && Math.abs(existing.start - cue.start) < 2);
    if (!duplicate) cues.push(cue);
  }
  const scopedCues = cues.filter(cue => {
    if (cue.kind !== "NUMBER") return true;
    const part2 = partStarts.get(2), part3 = partStarts.get(3);
    if (cue.first <= 6) return cue.start < Math.min(part2 ?? Infinity, part3 ?? Infinity, partStarts.get(4) ?? Infinity);
    return (part2 === undefined || cue.start >= part2) && cue.start < Math.min(part3 ?? Infinity, partStarts.get(4) ?? Infinity);
  });
  const candidates: Array<{ segment: Segment; probability: number; warnings: string[] }> = [], unresolved: Array<{ first: number; last: number; reason: string }> = [];
  const groups = listeningGroups();
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index], matches = scopedCues.filter(cue => cue.first === group.first && cue.last === group.last);
    if (matches.length !== 1) { unresolved.push({ first: group.first, last: group.last, reason: matches.length ? "Nhiều mốc cùng số câu; cần đối chiếu." : "Chưa nhận dạng được lời đọc số câu/nhóm." }); continue; }
    const cue = matches[0];
    const next = groups[index + 1];
    let end: number | null = null;
    if (next && next.part !== group.part) end = partStarts.get(next.part) ?? null;
    else if (next) {
      const nextCues = scopedCues.filter(item => item.first === next.first && item.last === next.last);
      if (nextCues.length === 1) end = nextCues[0].start;
    } else if (complete) end = listeningEnd;
    if (end === null || end <= cue.end) { unresolved.push({ first: group.first, last: group.last, reason: "Chưa có mốc kết thúc đáng tin cậy; không đoán/cắt tự động." }); continue; }
    const segment = { ...group, start: Math.max(0, Math.round((cue.start - 0.2) * 1000) / 1000), end: Math.round((end - 0.2) * 1000) / 1000, reviewed: false };
    try {
      validateSegment(segment, duration, candidates.map(item => item.segment));
      const warnings = ["AI đề xuất; cần nghe duyệt trước khi xuất bản."];
      if (cue.probability < 0.75) warnings.push("Nhận dạng lời đọc số câu có độ tin cậy thấp.");
      candidates.push({ segment, probability: cue.probability, warnings });
    } catch { unresolved.push({ first: group.first, last: group.last, reason: "Mốc ngoài giới hạn, sai thứ tự hoặc chồng lấn; cần đối chiếu." }); }
  }
  return { candidates, unresolved, cues: scopedCues, partStarts: Object.fromEntries(partStarts), listeningEnd };
}
