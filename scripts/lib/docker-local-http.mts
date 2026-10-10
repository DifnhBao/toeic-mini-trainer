import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { buildQueryString, type HttpHandler } from '@smithy/core/protocols';
import type { HttpRequest, HttpHandlerOptions } from '@smithy/types';

const maximum = 128 * 1024 ** 2;
function fail(code: string): never { throw Object.assign(new Error(code), { code }); }

// A deliberately narrow HTTP/1.1 transport for a Docker --internal restore drill.
// No host ports, DNS destinations, shell interpolation or credential providers.
export function serializeLocalRequest(request: HttpRequest) {
  if (request.protocol !== 'http:' || request.hostname !== '127.0.0.1' || request.port !== 9000 ||
    request.username || request.password || request.fragment || !/^(GET|HEAD|PUT|DELETE)$/.test(request.method) ||
    !request.path.startsWith('/') || /[\s\x00-\x1f\x7f]/.test(request.path)) fail('LocalRequestRejected');
  const body = request.body == null ? Buffer.alloc(0) : typeof request.body === 'string' ? Buffer.from(request.body) :
    request.body instanceof Uint8Array ? Buffer.from(request.body) : fail('LocalRequestBodyRejected');
  try {
    if (body.length > maximum) fail('LocalRequestTooLarge');
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value) ||
        Object.hasOwn(headers, key.toLowerCase())) fail('LocalRequestHeadersRejected');
      headers[key.toLowerCase()] = value;
    }
    if (headers.host !== '127.0.0.1:9000' || headers['transfer-encoding'] ||
      (headers['content-length'] !== undefined && headers['content-length'] !== String(body.length))) fail('LocalRequestHeadersRejected');
    headers.connection = 'close';
    headers['content-length'] = String(body.length);
    const query = buildQueryString(request.query ?? {});
    const head = `${request.method} ${request.path}${query ? `?${query}` : ''} HTTP/1.1\r\n` +
      Object.entries(headers).map(([key, value]) => `${key}: ${value}\r\n`).join('') + '\r\n';
    if (Buffer.byteLength(head) > 65536) fail('LocalRequestHeadersRejected');
    return Buffer.concat([Buffer.from(head), body]);
  } finally { body.fill(0); }
}

export function parseLocalResponse(raw: Buffer, method: string) {
  let offset = 0, statusCode = 0, headers: Record<string, string> = {};
  for (let interim = 0; interim < 5; interim++) {
    const end = raw.indexOf('\r\n\r\n', offset);
    if (end < 0 || end - offset > 65536) fail('LocalResponseHeadersRejected');
    const lines = raw.subarray(offset, end).toString('latin1').split('\r\n');
    const status = /^HTTP\/1\.[01] ([1-5][0-9]{2})(?: [^\r\n]*)?$/.exec(lines.shift() ?? '');
    if (!status) fail('LocalResponseStatusRejected');
    statusCode = Number(status[1]); headers = {};
    for (const line of lines) {
      const pair = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*([^\x00-\x08\x0a-\x1f\x7f]*)$/.exec(line);
      if (!pair) fail('LocalResponseHeadersRejected');
      const name = pair[1].toLowerCase(), value = pair[2].trim();
      if (Object.hasOwn(headers, name)) {
        // MinIO emits repeated Vary fields. Framing headers must remain unique.
        if (name === 'content-length' || name === 'transfer-encoding') fail('LocalResponseHeadersRejected');
        headers[name] += `, ${value}`;
      } else headers[name] = value;
    }
    offset = end + 4;
    if (statusCode >= 200) break;
    if (statusCode !== 100) fail('LocalResponseStatusRejected');
  }
  if (statusCode < 200) fail('LocalResponseStatusRejected');
  const bytes = raw.subarray(offset);
  const length = headers['content-length'], encoding = headers['transfer-encoding'];
  if (length !== undefined && !/^(0|[1-9][0-9]*)$/.test(length)) fail('LocalResponseLengthRejected');
  if (length !== undefined && encoding !== undefined) fail('LocalResponseLengthRejected');
  if (method === 'HEAD' || statusCode === 204 || statusCode === 304) {
    if (bytes.length) fail('LocalResponseLengthRejected');
    return { statusCode, headers, body: Buffer.alloc(0) };
  }
  if (encoding !== undefined) {
    if (encoding.toLowerCase() !== 'chunked') fail('LocalResponseEncodingRejected');
    const chunks: Buffer[] = []; let cursor = 0, size = 0;
    for (;;) {
      const end = bytes.indexOf('\r\n', cursor);
      if (end < 0 || end - cursor > 1024) fail('LocalResponseChunkRejected');
      const line = bytes.subarray(cursor, end).toString('ascii');
      if (!/^[0-9a-fA-F]{1,8}(?:;[^\r\n]*)?$/.test(line)) fail('LocalResponseChunkRejected');
      const count = Number.parseInt(line.split(';')[0], 16); cursor = end + 2;
      if (count === 0) {
        // Empty trailer block, or bounded, syntactically valid trailers.
        const trailers = bytes.subarray(cursor);
        if (trailers.length > 65536 || !trailers.toString('latin1').endsWith('\r\n') ||
          !/^(?:[!#$%&'*+.^_`|~0-9A-Za-z-]+:[^\r\n]*\r\n)*\r\n$/.test(trailers.toString('latin1'))) fail('LocalResponseChunkRejected');
        break;
      }
      size += count;
      if (size > maximum || cursor + count + 2 > bytes.length || bytes.subarray(cursor + count, cursor + count + 2).toString() !== '\r\n') fail('LocalResponseChunkRejected');
      chunks.push(bytes.subarray(cursor, cursor + count)); cursor += count + 2;
    }
    return { statusCode, headers, body: Buffer.concat(chunks, size) };
  }
  if (bytes.length > maximum || (length !== undefined && Number(length) !== bytes.length)) fail('LocalResponseLengthRejected');
  return { statusCode, headers, body: Buffer.from(bytes) };
}

export function dockerLocalHttp(helper: string): HttpHandler {
  if (!/^toeic-media-relay-[0-9a-f]{8}$/.test(helper)) fail('LocalHelperRejected');
  async function handle(request: HttpRequest, options: HttpHandlerOptions = {}) {
    if (options.abortSignal?.aborted) fail('LocalRequestAborted');
    const wire = serializeLocalRequest(request);
    const chunks: Buffer[] = []; let size = 0;
    try {
      const raw = await new Promise<Buffer>((done, reject) => {
        const child = spawn('docker', ['exec', '-i', helper, 'bash', '-c',
          'exec 3<>/dev/tcp/toeic-minio/9000; cat >&3; cat <&3'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
        let failed = false;
        const stop = (code: string) => { if (failed) return; failed = true; child.kill(); reject(Object.assign(new Error(code), { code })); };
        const abort = () => stop('LocalRequestAborted');
        const timer = setTimeout(() => stop('LocalRequestTimedOut'), 30000);
        const signal = options.abortSignal;
        const previousAbort = signal?.onabort;
        if (signal && 'addEventListener' in signal) signal.addEventListener('abort', abort);
        else if (signal) signal.onabort = abort;
        child.once('error', () => stop('LocalTransportFailed'));
        child.stdin.once('error', () => stop('LocalTransportFailed'));
        child.stdout.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maximum + 1024 ** 2) { chunk.fill(0); stop('LocalResponseTooLarge'); }
          else chunks.push(chunk);
        });
        child.once('close', code => {
          clearTimeout(timer);
          if (signal && 'removeEventListener' in signal) signal.removeEventListener('abort', abort);
          else if (signal) signal.onabort = previousAbort ?? null;
          if (!failed) { if (code !== 0) stop('LocalTransportFailed'); else done(Buffer.concat(chunks)); }
        });
        child.stdin.end(wire);
        if (options.abortSignal?.aborted) abort();
      });
      try {
        const result = parseLocalResponse(raw, request.method);
        const body = Readable.from([result.body]);
        body.once('close', () => result.body.fill(0));
        return { response: { ...result, body } };
      } finally { raw.fill(0); }
    } finally { wire.fill(0); for (const chunk of chunks) chunk.fill(0); }
  }
  return { handle, updateHttpClientConfig() {}, httpHandlerConfigs: () => ({}), destroy() {} };
}
