import { createReadStream } from "node:fs";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { exportClip, listeningGroups, probeAudio, validateSegment, type Segment } from "./lib/listening-segments.mts";

const sourceArgument = process.argv[2];
if (!sourceArgument) throw new Error('Dùng: npm run audio:prepare -- "đường dẫn file MP3" [thư mục xuất]');
const source = await realpath(path.resolve(sourceArgument));
const sourceMime = ({ ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4" } as Record<string, string>)[path.extname(source).toLowerCase()];
if (!sourceMime) throw new Error("Chọn audio MP3, WAV hoặc M4A.");
const sourceStat = await stat(source);
if (!sourceStat.isFile() || sourceStat.size > 100 * 1024 * 1024) throw new Error("Chọn file audio cục bộ tối đa 100 MiB.");
const duration = await probeAudio(source);
const hash = createHash("sha256");
for await (const chunk of createReadStream(source)) hash.update(chunk);
const sourceSha256 = hash.digest("hex");
const output = path.resolve(process.argv[3] || path.join("output", "audio", sourceSha256.slice(0, 12)));
await mkdir(output, { recursive: true });
if (await realpath(output) === path.dirname(source)) throw new Error("Hãy chọn thư mục xuất riêng với file nguồn.");
const manifestPath = path.join(output, "segments.json");
let segments: Segment[] = [];
const exports = new Map<string, { fileName: string; duration: number }>();
const aiSchema = z.object({ sourceSha256: z.string(), duration: z.number(),
  candidates: z.array(z.object({ segment: z.object({ part: z.number(), first: z.number(), last: z.number(), start: z.number(), end: z.number(), reviewed: z.literal(false) }).strict() })).max(54),
  unresolved: z.array(z.object({ first: z.number(), last: z.number(), reason: z.string().max(1000) })).max(54),
});
async function aiProposals() {
  const file = path.join(output, "ai-proposals.json");
  if ((await stat(file)).size > 1024 * 1024) throw new Error("File đề xuất AI quá lớn.");
  const data = aiSchema.parse(JSON.parse(await readFile(file, "utf8")));
  if (data.sourceSha256 !== sourceSha256 || data.duration !== duration) throw new Error("Đề xuất AI thuộc file audio khác.");
  const checked: Segment[] = [];
  for (const candidate of data.candidates.toSorted((a, b) => a.segment.first - b.segment.first)) {
    const segment = validateSegment(candidate.segment, duration, checked);
    if (checked.some(existing => existing.first === segment.first)) throw new Error("Đề xuất AI trùng số câu.");
    checked.push(segment);
  }
  return { candidates: checked, unresolved: data.unresolved };
}
try {
  const saved = JSON.parse(await readFile(manifestPath, "utf8"));
  if (saved.sourceSha256 !== sourceSha256 || saved.duration !== duration || !Array.isArray(saved.segments)) throw new Error("Thư mục xuất thuộc file nguồn khác hoặc manifest không hợp lệ.");
  for (const item of saved.segments) {
    const validated = validateSegment(item, duration, segments);
    if (segments.some(segment => segment.first === validated.first)) throw new Error("Manifest trùng nhóm câu.");
    segments.push(validated);
  }
} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

const key = randomBytes(24).toString("hex");
const uiDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "listening-audio-ui");
let authority = "";
let mutating = false;
function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
async function body(request: IncomingMessage) {
  let value = "";
  for await (const chunk of request) {
    value += chunk.toString();
    if (Buffer.byteLength(value) > 16384) throw new Error("Yêu cầu quá lớn.");
  }
  return JSON.parse(value);
}
async function save() {
  const temporary = `${manifestPath}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: 1, sourceFile: path.basename(source), sourceSha256, duration,
    segments: segments.toSorted((a, b) => a.first - b.first) }, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, manifestPath);
}
async function streamAudio(request: IncomingMessage, response: ServerResponse, file: string) {
  const size = (await stat(file)).size;
  const range = request.headers.range;
  let start = 0, end = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) { response.writeHead(416, { "Content-Range": `bytes */${size}` }); response.end(); return; }
    if (!match[1]) { start = Math.max(0, size - Number(match[2])); }
    else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      response.writeHead(416, { "Content-Range": `bytes */${size}` }); response.end(); return;
    }
  }
  response.writeHead(range ? 206 : 200, { "Content-Type": file === source ? sourceMime : "audio/mpeg",
    "Accept-Ranges": "bytes", "Content-Length": end - start + 1,
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) });
  if (request.method === "HEAD") { response.end(); return; }
  const stream = createReadStream(file, { start, end });
  stream.on("error", () => response.destroy());
  response.on("close", () => stream.destroy());
  stream.pipe(response);
}

const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  try {
    if (request.headers.host !== authority || (request.headers.origin && request.headers.origin !== `http://${authority}`)) {
      json(response, 403, { error: "Chỉ truy cập từ trang công cụ trên máy này." }); return;
    }
    const url = new URL(request.url || "/", `http://${authority}`);
    const publicAsset = ["/tool.js", "/tool.css", "/time.mjs"].includes(url.pathname) && request.method === "GET";
    if (!publicAsset && (request.headers["x-audio-key"] || url.searchParams.get("key")) !== key) { json(response, 403, { error: "Mở đúng liên kết trong terminal." }); return; }
    if (["/", "/tool.js", "/tool.css", "/time.mjs"].includes(url.pathname) && request.method === "GET") {
      const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      response.setHeader("Content-Type", name.endsWith("html") ? "text/html; charset=utf-8" : name.endsWith("js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8");
      response.end(await readFile(path.join(uiDirectory, name))); return;
    }
    if (url.pathname === "/state" && request.method === "GET") {
      let ai: { available: boolean; count: number; error?: string } = { available: false, count: 0 };
      try { ai = { available: true, count: (await aiProposals()).candidates.length }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") ai.error = "File đề xuất AI không hợp lệ; hãy chạy lại bước nhận dạng."; }
      json(response, 200, { sourceFile: path.basename(source), sourceSha256, duration, output, groups: listeningGroups(), segments, ai }); return;
    }
    if (url.pathname === "/audio" && ["GET", "HEAD"].includes(request.method || "")) { await streamAudio(request, response, source); return; }
    if (url.pathname.startsWith("/clip/") && ["GET", "HEAD"].includes(request.method || "")) {
      const exported = exports.get(url.pathname.slice(6));
      if (!exported) { json(response, 404, { error: "Đoạn chưa xuất trong phiên này." }); return; }
      await streamAudio(request, response, path.join(output, exported.fileName)); return;
    }
    if (["/save", "/export", "/ai/import"].includes(url.pathname) && request.method === "POST") {
      if (mutating) { json(response, 409, { error: "Đang lưu/cắt đoạn khác; hãy đợi." }); return; }
      if (!request.headers["content-type"]?.startsWith("application/json")) { json(response, 415, { error: "Cần dữ liệu JSON." }); return; }
      mutating = true;
      try {
        if (url.pathname === "/ai/import") {
          const proposals = await aiProposals();
          const additions: Segment[] = [];
          const conflicts: number[] = [];
          for (const proposed of proposals.candidates) {
            if (segments.some(saved => saved.first === proposed.first)) continue;
            try { additions.push(validateSegment(proposed, duration, [...segments, ...additions])); }
            catch { conflicts.push(proposed.first); }
          }
          const previous = segments;
          segments = [...segments, ...additions];
          try { await save(); } catch (error) { segments = previous; throw error; }
          json(response, 200, { segments, added: additions.length, conflicts, unresolved: proposals.unresolved });
          return;
        }
        const segment = validateSegment(await body(request), duration, segments);
        if (url.pathname === "/export" && !segment.reviewed) throw new Error("Nghe đối chiếu và xác nhận đúng đoạn trước khi xuất.");
        const previous = segments;
        segments = [...segments.filter(item => item.first !== segment.first), segment];
        try { await save(); } catch (error) { segments = previous; throw error; }
        if (url.pathname === "/export") {
          const exported = await exportClip(source, output, segment, duration);
          exports.set(exported.fileName, exported);
          json(response, 200, { ...exported, output, segments });
        } else json(response, 200, { segments });
      } finally { mutating = false; }
      return;
    }
    json(response, 404, { error: "Không tìm thấy." });
  } catch (error) {
    if (!response.headersSent) json(response, 400, { error: error instanceof Error ? error.message : "Không xử lý được audio." });
    else response.destroy();
  }
});
server.requestTimeout = 150_000;
server.headersTimeout = 15_000;
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được công cụ.");
  authority = `127.0.0.1:${address.port}`;
  console.log(`Mở trên máy này: http://${authority}/?key=${key}`);
  console.log(`Audio: ${path.basename(source)} (${duration.toFixed(3)} giây). Thư mục xuất: ${output}`);
  console.log("Chỉ xử lý cục bộ. Ctrl+C để đóng. Nếu đã nhận dạng, dùng nút Nạp mốc AI đề xuất. Không tự upload audio lên web.");
});
