import { createServer } from "node:http";
import { createHash } from "node:crypto";

// Loopback-only S3 protocol fixture. Never uses real credentials or R2.
export async function localObjectStorage() {
  const objects = new Map<string, { bytes: Buffer; type: string; etag: string }>();
  const requests: Array<{ method: string; key: string }> = [];
  let onSharedCopy: (() => Promise<void>) | null = null;
  const put = (key: string, bytes: Buffer, type: string) => {
    const value = { bytes, type, etag: createHash("md5").update(bytes).digest("hex") };
    objects.set(key, value); return value;
  };
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url!, "http://127.0.0.1").pathname;
      const key = decodeURIComponent(path).replace(/^\/fixture-bucket\//, "");
      requests.push({ method: request.method!, key });
      if (request.method === "PUT") {
        const copySource = request.headers["x-amz-copy-source"];
        if (typeof copySource === "string") {
          const source = objects.get(decodeURIComponent(copySource).replace(/^\/?fixture-bucket\//, ""));
          if (!source) { response.writeHead(404).end(); return; }
          if (request.headers["x-amz-copy-source-if-match"] !== `"${source.etag}"`) { response.writeHead(412).end(); return; }
          const copied = put(key, Buffer.from(source.bytes), source.type);
          if (key.startsWith("shared/") && onSharedCopy) await onSharedCopy();
          response.writeHead(200, { "content-type": "application/xml" });
          response.end(`<CopyObjectResult><LastModified>2026-10-08T00:00:00Z</LastModified><ETag>"${copied.etag}"</ETag></CopyObjectResult>`);
        } else {
          const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
          const value = put(key, Buffer.concat(chunks), String(request.headers["content-type"]));
          response.writeHead(200, { etag: `"${value.etag}"` }).end();
        }
        return;
      }
      if (request.method === "DELETE") { objects.delete(key); response.writeHead(204).end(); return; }
      const value = objects.get(key);
      if (!value) { response.writeHead(404).end(); return; }
      if (request.headers["if-match"] && request.headers["if-match"] !== `"${value.etag}"`) { response.writeHead(412).end(); return; }
      const ranged = request.headers.range === "bytes=0-15";
      const bytes = ranged ? value.bytes.subarray(0, 16) : value.bytes;
      response.writeHead(ranged ? 206 : 200, { "content-type": value.type, "content-length": bytes.length, etag: `"${value.etag}"` });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch { response.writeHead(500).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback fixture failed");
  return {
    endpoint: `http://127.0.0.1:${address.port}`, objects, requests, put,
    setSharedCopyHook: (hook: (() => Promise<void>) | null) => { onSharedCopy = hook; },
    close: async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}
