import { spawn } from "node:child_process";
import { access, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type Segment = { part: number; first: number; last: number; start: number; end: number; reviewed: boolean };
export const MAX_CLIP_SECONDS = 600;

export function listeningGroups() {
  return [
    ...Array.from({ length: 6 }, (_, i) => ({ part: 1, first: i + 1, last: i + 1 })),
    ...Array.from({ length: 25 }, (_, i) => ({ part: 2, first: i + 7, last: i + 7 })),
    ...Array.from({ length: 13 }, (_, i) => ({ part: 3, first: i * 3 + 32, last: i * 3 + 34 })),
    ...Array.from({ length: 10 }, (_, i) => ({ part: 4, first: i * 3 + 71, last: i * 3 + 73 })),
  ];
}

export function validateSegment(input: unknown, duration: number, others: Segment[] = []): Segment {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Đoạn audio không hợp lệ.");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["part", "first", "last", "start", "end", "reviewed"].includes(key))) throw new Error("Dữ liệu đoạn audio có trường không hợp lệ.");
  const { part, first, last, start, end, reviewed } = value;
  if (!listeningGroups().some(group => group.part === part && group.first === first && group.last === last)) {
    throw new Error("Part 1–2: một câu/đoạn; Part 3–4: ba câu/đoạn, theo số câu TOEIC 1–100.");
  }
  if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end)
    || start < 0 || end > duration || end <= start || end - start > MAX_CLIP_SECONDS || typeof reviewed !== "boolean") {
    throw new Error("Chọn đầu/cuối trong file, đầu < cuối, mỗi đoạn tối đa 10 phút.");
  }
  for (const other of others.filter(segment => segment.first !== first)) {
    if ((other.first < Number(first) && other.end > start) || (other.first > Number(first) && end > other.start)) {
      throw new Error(`Mốc thời gian chồng lấn hoặc sai thứ tự với câu ${other.first}–${other.last}.`);
    }
  }
  return { part: Number(part), first: Number(first), last: Number(last), start, end, reviewed };
}

export function clipName(segment: Segment) {
  const questions = String(segment.first).padStart(3, "0") + (segment.first === segment.last ? "" : `-${String(segment.last).padStart(3, "0")}`);
  return `part${segment.part}-q${questions}-${Math.round(segment.start * 1000)}-${Math.round(segment.end * 1000)}.mp3`;
}

export async function runMediaCommand(command: string, args: string[], timeout = 120_000) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { child.kill(); }, timeout);
    child.stdout.on("data", data => { stdout = (stdout + data.toString()).slice(-65536); });
    child.stderr.on("data", data => { stderr = (stderr + data.toString()).slice(-8192); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => { clearTimeout(timer); if (code === 0) resolve(stdout); else reject(new Error(`Công cụ audio không hoàn tất (${code}): ${stderr}`)); });
  });
}

export async function probeAudio(file: string) {
  const result = JSON.parse(await runMediaCommand("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-select_streams", "a:0", "-show_entries", "format=duration:stream=codec_name", "-of", "json", file]));
  const duration = Number(result.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 7200 || !result.streams?.length) throw new Error("Cần file audio đọc được, dài tối đa 2 giờ.");
  return duration;
}

// Decode/re-encode instead of copying MP3 frames: avoids a broken bit reservoir
// at the first frame and removes the source's duration/cover metadata.
export async function exportClip(source: string, directory: string, input: Segment, duration: number) {
  const segment = validateSegment(input, duration);
  if (!segment.reviewed) throw new Error("Nghe đối chiếu và xác nhận đúng đoạn trước khi xuất.");
  return encodeClip(source, directory, segment, clipName(segment));
}

// AI draft clips are separate files; this never grants human review/approval.
export async function exportDraftClip(source: string, directory: string, input: Segment, duration: number) {
  const segment = validateSegment({ ...input, reviewed: false }, duration);
  return encodeClip(source, directory, segment, `draft-${clipName(segment)}`);
}

async function encodeClip(source: string, directory: string, segment: Segment, fileName: string) {
  const destination = path.join(directory, fileName);
  try { await access(destination); throw new Error("File đã tồn tại. Công cụ không ghi đè audio đã xuất."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const temporary = path.join(directory, `.cut-${randomUUID()}.mp3`);
  try {
    await runMediaCommand("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-n",
      "-ss", String(segment.start), "-protocol_whitelist", "file,pipe", "-i", source, "-t", String(segment.end - segment.start),
      "-map", "0:a:0", "-vn", "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "128k", temporary]);
    const actual = await probeAudio(temporary);
    if (Math.abs(actual - (segment.end - segment.start)) > 0.2) throw new Error("Độ dài audio xuất không khớp mốc đã chọn.");
    // Hard-link fails if destination appeared during encoding; unlike rename,
    // this cannot replace an existing clip on either Windows or POSIX.
    const { link } = await import("node:fs/promises");
    await link(temporary, destination);
    return { fileName, duration: actual };
  } finally { await rm(temporary, { force: true }); }
}
