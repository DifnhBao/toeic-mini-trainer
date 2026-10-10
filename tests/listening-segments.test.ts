import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { get } from "node:http";
import { exportClip, exportDraftClip, listeningGroups, probeAudio, runMediaCommand, validateSegment } from "../scripts/lib/listening-segments.mts";
import { formatTime, parseTime } from "../scripts/listening-audio-ui/time.mjs";

const reviewed = { part: 1, first: 1, last: 1, start: 1, end: 2, reviewed: true };
const mediaAvailable = ["ffmpeg", "ffprobe"].every(command => spawnSync(command, ["-version"], { windowsHide: true }).status === 0);

test("segments cover all 100 questions once and preserve three-question listening contexts", () => {
  const groups = listeningGroups();
  assert.equal(groups.length, 54);
  assert.deepEqual([1, 2, 3, 4].map(part => groups.filter(group => group.part === part).length), [6, 25, 13, 10]);
  assert.deepEqual(groups.flatMap(group => Array.from({ length: group.last - group.first + 1 }, (_, i) => i + group.first)), Array.from({ length: 100 }, (_, i) => i + 1));
  assert.throws(() => validateSegment({ ...reviewed, part: 3, first: 32, last: 32 }, 100), /ba câu/);
  assert.equal(validateSegment({ ...reviewed, part: 3, first: 32, last: 34 }, 100).last, 34);
});

test("rejects reversed, unbounded, overlapping or injected segmentation input", () => {
  for (const invalid of [null, [], { ...reviewed, start: -1 }, { ...reviewed, end: 1 },
    { ...reviewed, start: NaN }, { ...reviewed, end: Infinity }, { ...reviewed, end: 700 },
    { ...reviewed, reviewed: "yes" }, { ...reviewed, file: "../../outside.mp3" }]) assert.throws(() => validateSegment(invalid, 1000));
  assert.throws(() => validateSegment({ ...reviewed, end: 101 }, 100));
  assert.throws(() => validateSegment(reviewed, 100, [{ ...reviewed, first: 2, last: 2, start: 1.5, end: 3 }]), /chồng lấn/);
  assert.throws(() => validateSegment({ ...reviewed, first: 2, last: 2, start: 0, end: 1 }, 100, [reviewed]), /sai thứ tự/);
  assert.doesNotThrow(() => validateSegment({ ...reviewed, first: 2, last: 2, start: 2, end: 3 }, 100, [reviewed]));
});

test("time input preserves millisecond marks and rejects ambiguous values", () => {
  assert.equal(parseTime("1:02.345"), 62.345);
  assert.equal(parseTime("1:02:03.004"), 3723.004);
  assert.equal(parseTime("62.345"), 62.345);
  assert.equal(formatTime(59.9999), "1:00.000");
  assert.equal(parseTime(formatTime(2762.867)), 2762.867);
  for (const value of ["", "-1", "1:60", "1.5:02", "1:2:3:4", "NaN", "1.2345", "0:99:01"]) assert.throws(() => parseTime(value));
});

function toneFixture() {
  const rate = 44100, samples = rate * 3, data = Buffer.alloc(44 + samples * 2);
  data.write("RIFF"); data.writeUInt32LE(data.length - 8, 4); data.write("WAVEfmt ", 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write("data", 36); data.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const frequency = [300, 1000, 2500][Math.floor(i / rate)];
    data.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * frequency * i / rate)), 44 + i * 2);
  }
  return data;
}

test("FFmpeg export selects the requested sound, validates duration and preserves source/files", { skip: !mediaAvailable, timeout: 30000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toeic-audio-test-"));
  try {
    const source = path.join(directory, "fixture.wav"); await writeFile(source, toneFixture());
    const original = createHash("sha256").update(await readFile(source)).digest("hex");
    await assert.rejects(exportClip(source, directory, { ...reviewed, reviewed: false }, 3), /xác nhận/);
    const clip = await exportClip(source, directory, reviewed, 3);
    assert.ok(Math.abs(clip.duration - 1) < 0.2);
    const output = path.join(directory, clip.fileName);
    assert.equal(await probeAudio(output), clip.duration);
    const pcm = path.join(directory, "check.pcm");
    await runMediaCommand("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", output, "-f", "s16le", "-ac", "1", "-ar", "44100", pcm]);
    const decoded = await readFile(pcm);
    // The middle second must contain the 1 kHz tone, not the source's 300 Hz
    // first second. Ignore boundary/codec padding and count positive crossings.
    let crossings = 0;
    for (let i = 4410; i < 39690; i++) if (decoded.readInt16LE((i - 1) * 2) <= 0 && decoded.readInt16LE(i * 2) > 0) crossings++;
    assert.ok(Math.abs(crossings - 800) < 8, `Expected 1 kHz, got ${crossings} crossings in 0.8 s`);
    const exportedHash = createHash("sha256").update(await readFile(output)).digest("hex");
    await assert.rejects(exportClip(source, directory, reviewed, 3), /không ghi đè/);
    assert.equal(createHash("sha256").update(await readFile(output)).digest("hex"), exportedHash);
    assert.equal(createHash("sha256").update(await readFile(source)).digest("hex"), original);
    const draft = await exportDraftClip(source, directory, { ...reviewed, reviewed: false }, 3);
    assert.ok(draft.fileName.startsWith("draft-part1-q001"));
    assert.ok(Math.abs(draft.duration - 1) < 0.2);
    await assert.rejects(exportClip(path.join(directory, "missing.mp3"), directory, { ...reviewed, start: 0, end: 1 }, 3));
    assert.ok((await readdir(directory)).every(name => !name.startsWith(".cut-")));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

async function startTool(source: string, directory: string) {
  const child = spawn(process.execPath, ["--experimental-strip-types", "scripts/prepare-listening-audio.mts", source, directory], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const url = await new Promise<URL>((resolve, reject) => {
    let log = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Tool startup timed out")); }, 10000);
    child.stdout.on("data", chunk => {
      log += chunk.toString(); const match = /http:\/\/127\.0\.0\.1:\d+\/\?key=[a-f0-9]+/.exec(log);
      if (match) { clearTimeout(timer); resolve(new URL(match[0])); }
    });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("exit", code => { clearTimeout(timer); reject(new Error(`Tool exited ${code}`)); });
  });
  return { child, url };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  await new Promise<void>(resolve => { child.once("exit", () => resolve()); child.kill(); });
}

test("local tool streams ranges, guards private audio and persists/reopens reviewed marks", { skip: !mediaAvailable, timeout: 30000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toeic-audio-server-"));
  let child: ChildProcess | undefined;
  try {
    const source = path.join(directory, "fixture.wav"); await writeFile(source, toneFixture());
    const output = path.join(directory, "clips");
    let running = await startTool(source, output); child = running.child;
    let url = running.url;
    const endpoint = (route: string) => `${url.origin}${route}${url.search}`;
    assert.equal((await fetch(`${url.origin}/state`)).status, 403);
    assert.equal((await fetch(endpoint("/state"), { headers: { Origin: "https://outside.example" } })).status, 403);
    const wrongHostStatus = await new Promise(resolve => { get(endpoint("/state"), { headers: { Host: "outside.example" } }, response => { response.resume(); resolve(response.statusCode); }); });
    assert.equal(wrongHostStatus, 403);
    const html = await fetch(url); assert.match(html.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
    assert.match(await html.text(), /Chia audio/);
    assert.equal((await fetch(`${url.origin}/tool.js`)).status, 200);
    assert.equal((await fetch(`${url.origin}/time.mjs`)).headers.get("content-type"), "text/javascript; charset=utf-8");
    const partial = await fetch(endpoint("/audio"), { headers: { Range: "bytes=0-43" } });
    assert.equal(partial.status, 206); assert.deepEqual(Buffer.from(await partial.arrayBuffer()), toneFixture().subarray(0, 44));
    assert.equal((await fetch(endpoint("/audio"), { headers: { Range: "bytes=0-2,5-8" } })).status, 416);
    assert.equal((await fetch(endpoint("/clip/__proto__"))).status, 404);
    const post = (route: string, data: unknown) => fetch(endpoint(route), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    assert.equal((await post("/export", { ...reviewed, reviewed: false })).status, 400);
    assert.equal((await post("/save", reviewed)).status, 200);
    const proposed = { ...reviewed, first: 2, last: 2, start: 2, end: 2.8, reviewed: false };
    const proposals = { sourceSha256: createHash("sha256").update(await readFile(source)).digest("hex"), duration: 3, candidates: [{ segment: proposed }], unresolved: [] };
    await writeFile(path.join(output, "ai-proposals.json"), JSON.stringify(proposals));
    assert.equal((await (await fetch(endpoint("/state"))).json()).ai.count, 1);
    const imported = await post("/ai/import", {}); assert.equal(imported.status, 200);
    assert.equal((await imported.json()).added, 1);
    assert.equal((await (await post("/ai/import", {})).json()).added, 0);
    await writeFile(path.join(output, "ai-proposals.json"), JSON.stringify({ ...proposals, sourceSha256: "wrong" }));
    assert.equal((await post("/ai/import", {})).status, 400);
    await writeFile(path.join(output, "ai-proposals.json"), JSON.stringify({ ...proposals, candidates: [{ segment: { ...proposed, reviewed: true } }] }));
    assert.equal((await post("/ai/import", {})).status, 400);
    const exported = await post("/export", reviewed); assert.equal(exported.status, 200);
    const data = await exported.json();
    const clip = await fetch(endpoint(`/clip/${data.fileName}`)); assert.equal(clip.status, 200);
    assert.deepEqual(Buffer.from(await clip.arrayBuffer()), await readFile(path.join(output, data.fileName)));
    assert.equal((await post("/export", reviewed)).status, 400);
    assert.equal((await post("/save", { ...reviewed, first: 2, last: 2, start: 1.5, end: 2.5 })).status, 400);
    assert.equal((await post("/save", { ...reviewed, extra: "x".repeat(17000) })).status, 400);
    await stop(child); running = await startTool(source, output); child = running.child; url = running.url;
    const restored = await (await fetch(endpoint("/state"))).json(); assert.deepEqual(restored.segments, [reviewed, proposed]);
    const manifest = JSON.parse(await readFile(path.join(output, "segments.json"), "utf8"));
    assert.equal(manifest.sourceSha256, createHash("sha256").update(await readFile(source)).digest("hex"));
  } finally { if (child) await stop(child); await rm(directory, { recursive: true, force: true }); }
});
