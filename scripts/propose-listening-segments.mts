import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { detectListeningCues, proposeFromCues, type Cue } from "./lib/listening-cues.mts";

const word = z.object({ text: z.string().max(1000), start: z.number().nonnegative(), end: z.number().nonnegative(), probability: z.number().min(0).max(1) });
const schema = z.object({ sourceFile: z.string().max(500), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), duration: z.number().positive().max(7200), complete: z.boolean(),
  chunks: z.array(z.object({ start: z.number().nonnegative(), end: z.number().nonnegative(), segments: z.array(z.object({ start: z.number().nonnegative(), end: z.number().nonnegative(), text: z.string().max(10000), words: z.array(word).max(500) })).max(500) })).max(60) });
const transcriptPath = process.argv[2], output = process.argv[3];
if (!transcriptPath || !output) throw new Error("Usage: node --experimental-strip-types scripts/propose-listening-segments.mts transcript.json ai-proposals.json");
if ((await stat(transcriptPath)).size > 10 * 1024 * 1024) throw new Error("Transcript exceeds 10 MiB");
const transcript = schema.parse(JSON.parse(await readFile(transcriptPath, "utf8")));
// Parse each chunk independently before merging announcements. This keeps
// complete ranges across boundaries without interleaving two ASR alternatives.
const cues: Cue[] = [], starts: Record<number, number> = {};
let listeningEnd: number | null = null;
for (const chunk of transcript.chunks.toSorted((a, b) => a.start - b.start)) {
  const words = chunk.segments.flatMap(segment => segment.words.map((word, index) => ({ ...word,
    standaloneNumber: index === 0 && (/^\s*\d{1,3}[.,:]\s*/.test(segment.text) || /^\s*\d{1,3}\s*$/.test(segment.text)),
  })));
  const parsed = detectListeningCues(words, transcript.duration, transcript.complete);
  cues.push(...parsed.cues);
  for (const [part, start] of Object.entries(parsed.partStarts)) starts[Number(part)] = Math.min(starts[Number(part)] ?? Infinity, start);
  if (parsed.listeningEnd !== null) listeningEnd = Math.min(listeningEnd ?? Infinity, parsed.listeningEnd);
}
const result = proposeFromCues(cues, starts, transcript.duration, transcript.complete, listeningEnd);
await writeFile(path.resolve(output), JSON.stringify({ version: 1, sourceSha256: transcript.sourceSha256, duration: transcript.duration, complete: transcript.complete, ...result }, null, 2), { encoding: "utf8", flag: "w" });
console.log(`${result.candidates.length}/54 proposed segments; ${result.unresolved.length} unresolved. Human review remains required.`);
