import { createReadStream } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { exportDraftClip, probeAudio, validateSegment, type Segment } from "./lib/listening-segments.mts";

const [sourceArgument, proposalsArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !proposalsArgument || !outputArgument) throw new Error("Usage: export-listening-drafts.mts source.mp3 ai-proposals.json output-directory");
const source = await realpath(sourceArgument), output = path.resolve(outputArgument);
const duration = await probeAudio(source);
const sha = createHash("sha256"); for await (const chunk of createReadStream(source)) sha.update(chunk);
const sourceSha256 = sha.digest("hex");
const proposals = z.object({ sourceSha256: z.string(), duration: z.number(), candidates: z.array(z.object({ segment: z.object({
  part: z.number(), first: z.number(), last: z.number(), start: z.number(), end: z.number(), reviewed: z.literal(false),
}).strict() })).max(54) }).parse(JSON.parse(await readFile(proposalsArgument, "utf8")));
if (proposals.sourceSha256 !== sourceSha256 || proposals.duration !== duration) throw new Error("AI proposals belong to another audio source");
const segments: Segment[] = [];
for (const candidate of proposals.candidates) {
  const segment = validateSegment(candidate.segment, duration, segments);
  if (segments.some(existing => existing.first === segment.first)) throw new Error("Duplicate question group");
  segments.push(segment);
}
await mkdir(output, { recursive: true });
const manifest: Array<{ segment: Segment; fileName: string; duration: number; sha256: string }> = [];
for (const segment of segments) {
  const exported = await exportDraftClip(source, output, segment, duration);
  const checksum = createHash("sha256"); for await (const chunk of createReadStream(path.join(output, exported.fileName))) checksum.update(chunk);
  manifest.push({ segment, ...exported, sha256: checksum.digest("hex") });
  await writeFile(path.join(output, "draft-manifest.json"), JSON.stringify({ sourceSha256, needsHumanReview: true, clips: manifest }, null, 2), "utf8");
  console.log(`Prepared draft ${segment.first}-${segment.last}: ${exported.fileName}`);
}
console.log(`${manifest.length} draft MP3 clips ready. Not approved or uploaded.`);
