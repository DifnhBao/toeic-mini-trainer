import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

// HTTP protocol fixture, NOT an S3 implementation or a security boundary.
// No disk/cloud storage; close() zeroes all retained content, even on failure.
export async function restoreObjectStorage(options: { corruptRead?: boolean; corruptMetadata?: boolean; corruptRange?: boolean; rejectPut?: boolean; rejectDelete?: boolean; collision?: boolean; headCollision?: boolean; ambiguousPut?: boolean } = {}) {
  const buckets = new Map<string, Map<string, { bytes: Buffer; headers: Record<string, string> }>>();
  const counts = { create: 0, put: 0, get: 0, range: 0, deleteObject: 0, deleteBucket: 0 };
  const server = createServer(async (request, response) => {
    try {
      // Minimal fixture gate only: this does not validate AWS signatures.
      if (!request.headers.authorization?.includes('Credential=toeic-local-restore/')) { response.writeHead(403).end(); return; }
      const path = request.url!.split('?')[0].replace(/^\//, '');
      const split = path.indexOf('/');
      const bucket = decodeURIComponent(split < 0 ? path : path.slice(0, split));
      const key = split < 0 ? '' : decodeURIComponent(path.slice(split + 1));
      if (!/^toeic-restore-[0-9a-f-]{36}$/.test(bucket)) { response.writeHead(403).end(); return; }
      if (!key && request.method === 'HEAD') { response.writeHead(options.headCollision || buckets.has(bucket) ? 200 : 404).end(); return; }
      if (!key && request.method === 'PUT') {
        counts.create++;
        if (options.collision || buckets.has(bucket)) { response.writeHead(409).end(); return; }
        buckets.set(bucket, new Map()); response.writeHead(200).end(); return;
      }
      const objects = buckets.get(bucket);
      if (!objects) { response.writeHead(404).end(); return; }
      if (!key && request.method === 'DELETE') {
        counts.deleteBucket++;
        if (objects.size) { response.writeHead(409).end(); return; }
        buckets.delete(bucket); response.writeHead(204).end(); return;
      }
      if (request.method === 'PUT') {
        counts.put++;
        if (options.rejectPut) { response.writeHead(500).end(); return; }
        if (request.headers['if-none-match'] !== '*' || objects.has(key)) { response.writeHead(412).end(); return; }
        const chunks: Buffer[] = [];
        let size = 0;
        try {
          for await (const chunk of request) {
            size += chunk.length;
            if (size > 128 * 1024 ** 2) throw new Error('FixtureSizeLimit');
            chunks.push(Buffer.from(chunk));
          }
          const bytes = Buffer.concat(chunks);
          const headers: Record<string, string> = { etag: `"${createHash('md5').update(bytes).digest('hex')}"` };
          for (const [name, value] of Object.entries(request.headers)) {
            if (name.startsWith('x-amz-meta-') || ['content-type', 'cache-control', 'content-disposition', 'content-encoding', 'content-language'].includes(name)) {
              if (typeof value === 'string') headers[name] = value;
            }
          }
          objects.set(key, { bytes, headers });
          if (options.ambiguousPut) { response.writeHead(500).end(); return; }
          response.writeHead(200, { etag: headers.etag }).end();
        } finally { for (const chunk of chunks) chunk.fill(0); }
        return;
      }
      if (request.method === 'DELETE') {
        counts.deleteObject++;
        if (options.rejectDelete) { response.writeHead(500).end(); return; }
        objects.get(key)?.bytes.fill(0); objects.delete(key); response.writeHead(204).end(); return;
      }
      const object = objects.get(key);
      if (!object) { response.writeHead(404).end(); return; }
      counts.get++;
      const match = request.headers.range?.match(/^bytes=0-(\d+)$/);
      const end = match ? Number(match[1]) : object.bytes.length - 1;
      if (match && end >= object.bytes.length) { response.writeHead(416).end(); return; }
      const bytes = Buffer.from(object.bytes.subarray(0, end + 1));
      if (options.corruptRead && bytes.length) bytes[0] ^= 1;
      if (match) counts.range++;
      response.writeHead(match ? 206 : 200, { ...object.headers, 'content-length': bytes.length,
        ...(options.corruptMetadata ? { 'cache-control': 'public' } : {}),
        ...(match ? { 'content-range': `bytes 0-${end}/${options.corruptRange ? object.bytes.length + 1 : object.bytes.length}` } : {}) });
      response.end(bytes, () => bytes.fill(0));
    } catch { response.writeHead(500).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('LoopbackFixtureRequired');
  return {
    endpoint: `http://127.0.0.1:${address.port}`, counts, buckets,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      for (const objects of buckets.values()) for (const object of objects.values()) object.bytes.fill(0);
      buckets.clear();
    },
  };
}
