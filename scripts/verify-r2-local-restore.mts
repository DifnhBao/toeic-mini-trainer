import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { dpapi, verifyBackup, visitVerifiedBackup, type Protector, type RecoveredObject } from './backup-r2-windows.mts';

function fail(code: string): never { throw Object.assign(new Error(code), { code }); }
export function validateLocalRestoreEndpoint(value: string) {
  const url = new URL(value);
  // Literal loopback avoids DNS resolution, redirects and accidental .env R2 targets.
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash) fail('LoopbackEndpointRequired');
  return url.origin;
}
const headers = {
  contentType: 'ContentType', cacheControl: 'CacheControl', contentDisposition: 'ContentDisposition',
  contentEncoding: 'ContentEncoding', contentLanguage: 'ContentLanguage',
} as const;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export async function verifyLocalRestore(directory: string, endpoint: string, protect: Protector = dpapi, requestHandler?: S3ClientConfig['requestHandler']) {
  endpoint = validateLocalRestoreEndpoint(endpoint);
  const preflight = await verifyBackup(directory, protect);
  const bucket = `toeic-restore-${randomUUID()}`;
  // Only local fixture credentials, never cloud/default credential providers.
  const client = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, maxAttempts: 1,
    credentials: { accessKeyId: 'toeic-local-restore', secretAccessKey: 'local-restore-only' },
    followRegionRedirects: false, requestHandler,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  const send = <T,>(command: T) => client.send(command as Parameters<S3Client['send']>[0], { abortSignal: AbortSignal.timeout(30000) });
  const keys: string[] = [];
  let created = false;
  let checked = 0;
  let ranges = 0;
  let cleanupFailed = false;
  let failure: unknown;
  async function checkRead(object: RecoveredObject, expected: Buffer, range?: string) {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: object.key, Range: range }), { abortSignal: AbortSignal.timeout(30000) });
    if (!result.Body) fail('RestoreReadMissing');
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > expected.length) fail('RestoreReadMismatch');
        chunks.push(Buffer.from(chunk));
      }
      const read = Buffer.concat(chunks);
      try {
        if (size !== expected.length || hash(read) !== hash(expected) || result.ContentLength !== expected.length) fail('RestoreReadMismatch');
        if (!range) {
          if (Object.entries(object.metadata).some(([key, value]) => result.Metadata?.[key.toLowerCase()] !== value) ||
            Object.keys(result.Metadata ?? {}).length !== Object.keys(object.metadata).length) fail('RestoreMetadataMismatch');
          for (const [source, target] of Object.entries(headers)) {
            if (object[source as keyof typeof headers] !== undefined && result[target as typeof headers[keyof typeof headers]] !== object[source as keyof typeof headers]) fail('RestoreMetadataMismatch');
          }
        } else if (result.$metadata.httpStatusCode !== 206 || result.ContentRange !== `bytes 0-${expected.length - 1}/${object.size}`) fail('RestoreRangeMismatch');
      } finally { read.fill(0); }
    } finally {
      if ('destroy' in result.Body) result.Body.destroy();
      for (const chunk of chunks) chunk.fill(0);
    }
  }
  try {
    let missing = false;
    try { await send(new HeadBucketCommand({ Bucket: bucket })); }
    catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) missing = true; else throw error; }
    if (!missing) fail('LocalBucketAlreadyExists');
    // A collision is a hard failure: never delete/restore into an existing bucket.
    await send(new CreateBucketCommand({ Bucket: bucket }));
    created = true;
    await visitVerifiedBackup(directory, async (object, bytes) => {
      await send(new PutObjectCommand({ Bucket: bucket, Key: object.key, Body: bytes, ContentLength: bytes.length,
        IfNoneMatch: '*', Metadata: object.metadata, ContentType: object.contentType,
        CacheControl: object.cacheControl, ContentDisposition: object.contentDisposition,
        ContentEncoding: object.contentEncoding, ContentLanguage: object.contentLanguage }));
      // Delete only acknowledged writes. A failed/ambiguous PUT may leave data;
      // bucket deletion then fails visibly instead of deleting an unknown object.
      keys.push(object.key);
      await checkRead(object, bytes);
      checked++;
      if (bytes.length > 0) {
        const end = Math.min(15, bytes.length - 1);
        await checkRead(object, bytes.subarray(0, end + 1), `bytes=0-${end}`);
        ranges++;
      }
    }, protect);
    if (checked !== preflight.objects) fail('RestoreCountMismatch');
  } catch (error) { failure = error; }
  finally {
    if (created) {
      // Only keys from this run in its newly created UUID bucket. No bulk deletion.
      for (const key of keys) {
        try { await send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
        catch { cleanupFailed = true; }
      }
      try { await send(new DeleteBucketCommand({ Bucket: bucket })); }
      catch { cleanupFailed = true; }
    }
    client.destroy();
  }
  if (cleanupFailed) throw Object.assign(new Error('LocalRestoreCleanupFailed'), { code: 'LocalRestoreCleanupFailed', localBucket: bucket });
  if (failure) throw failure;
  return { verified: true, objects: checked, bytes: preflight.bytes, rangeReads: ranges,
    metadataChecked: true, cleaned: true, cloudWrites: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    if (process.env.ALLOW_LOCAL_R2_RESTORE !== 'true' || process.argv.length !== 4) fail('LocalRestoreOptInRequired');
    const directory = resolve(process.argv[2]);
    if (dirname(directory) !== resolve(dirname(fileURLToPath(import.meta.url)), '../Test/backups')) fail('BackupPathRequired');
    console.log(JSON.stringify(await verifyLocalRestore(directory, process.argv[3])));
  })().catch(error => {
    // Never log decoded metadata, paths, endpoint responses or credentials.
    console.error(JSON.stringify({ errorType: error.name, code: /^[A-Za-z0-9_]+$/.test(error.code ?? '') ? error.code : undefined,
      localBucket: /^toeic-restore-[0-9a-f-]{36}$/.test(error.localBucket ?? '') ? error.localBucket : undefined }));
    process.exitCode = 1;
  });
}
