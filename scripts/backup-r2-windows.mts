import { spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

const FORMAT = 'toeic-r2-backup-v1';
const MAGIC = Buffer.from('TMTR2B1\0');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../Test/backups');
export const LIMITS = { objects: 1000, bytes: 1024 ** 3, objectBytes: 128 * 1024 ** 2 };
type Limits = typeof LIMITS;
export type Entry = { key: string; size: number; etag: string; modified: string };
export type ObjectData = { bytes: Buffer; metadata: Record<string, string>; contentType?: string; cacheControl?: string; contentDisposition?: string; contentEncoding?: string; contentLanguage?: string };
export type RecoveredObject = Entry & Omit<ObjectData, 'bytes'> & { sha256: string };
type ObjectVisitor = (object: RecoveredObject, bytes: Buffer) => Promise<void>;
export type Source = { identity: string; list: () => Promise<Entry[]>; get: (entry: Entry) => Promise<ObjectData> };
export type Protector = (bytes: Buffer, decrypt?: boolean) => Buffer;
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function fail(code: string): never { throw Object.assign(new Error(code), { code }); }

export function validateInventory(entries: Entry[], limits: Limits = LIMITS): Entry[] {
  if (!Array.isArray(entries) || entries.length > limits.objects) fail('InventoryLimit');
  const seen = new Set<string>();
  let total = 0;
  for (const item of entries) {
    if (!item || typeof item.key !== 'string' || !item.key || Buffer.byteLength(item.key) > 1024 || seen.has(item.key) ||
      !Number.isSafeInteger(item.size) || item.size < 0 || item.size > limits.objectBytes ||
      typeof item.etag !== 'string' || !item.etag || item.etag.length > 256 ||
      typeof item.modified !== 'string' || !Number.isFinite(Date.parse(item.modified))) fail('InvalidInventory');
    seen.add(item.key);
    total += item.size;
    if (total > limits.bytes) fail('InventoryLimit');
  }
  return [...entries].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

export async function readInventory(client: S3Client, bucket: string, limits: Limits = LIMITS) {
  const entries: Entry[] = [];
  const seenTokens = new Set<string>();
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000, ContinuationToken: token }), { abortSignal: AbortSignal.timeout(15000) });
    for (const object of page.Contents ?? []) {
      if (object.Key === undefined || object.Size === undefined || !object.ETag || !object.LastModified) fail('InvalidInventory');
      entries.push({ key: object.Key, size: object.Size, etag: object.ETag, modified: object.LastModified.toISOString() });
    }
    validateInventory(entries, limits);
    if (!page.IsTruncated) break;
    if (!page.NextContinuationToken || seenTokens.has(page.NextContinuationToken)) fail('InvalidPagination');
    token = page.NextContinuationToken;
    seenTokens.add(token);
    if (seenTokens.size > limits.objects + 1) fail('InventoryLimit');
  } while (token);
  return validateInventory(entries, limits);
}

export async function readObject(client: S3Client, bucket: string, entry: Entry): Promise<ObjectData> {
  const signal = AbortSignal.timeout(120000);
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: entry.key, IfMatch: entry.etag }), { abortSignal: signal });
  // ListObjectsV2 preserves milliseconds; the GET HTTP Last-Modified header has second precision.
  // ETag/size remain exact, and the final inventory comparison retains full timestamp precision.
  const sameModifiedSecond = object.LastModified && Math.floor(object.LastModified.getTime() / 1000) === Math.floor(Date.parse(entry.modified) / 1000);
  if (!object.Body || object.ContentLength !== entry.size || object.ETag !== entry.etag || !sameModifiedSecond) {
    if (object.Body && 'destroy' in object.Body) object.Body.destroy();
    fail('SourceChanged');
  }
  const chunks: Buffer[] = [];
  let length = 0;
  const stream = object.Body;
  const abort = () => { if ('destroy' in stream) stream.destroy(new Error('ReadTimeout')); };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  try {
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      length += chunk.length;
      if (length > entry.size) fail('ObjectMismatch');
      chunks.push(Buffer.from(chunk));
    }
    if (length !== entry.size) fail('ObjectMismatch');
    return { bytes: Buffer.concat(chunks), metadata: object.Metadata ?? {}, contentType: object.ContentType, cacheControl: object.CacheControl, contentDisposition: object.ContentDisposition, contentEncoding: object.ContentEncoding, contentLanguage: object.ContentLanguage };
  } finally {
    signal.removeEventListener('abort', abort);
    if ('destroy' in stream) stream.destroy();
    for (const chunk of chunks) chunk.fill(0);
  }
}

function seal(bytes: Buffer, key: Buffer, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${FORMAT}\n${context}`));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

function open(bytes: Buffer, key: Buffer, context: string) {
  if (bytes.length < 36 || !bytes.subarray(0, 8).equals(MAGIC)) fail('InvalidEnvelope');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(8, 20));
  decipher.setAAD(Buffer.from(`${FORMAT}\n${context}`));
  decipher.setAuthTag(bytes.subarray(20, 36));
  return Buffer.concat([decipher.update(bytes.subarray(36)), decipher.final()]);
}

async function boundedFile(path: string, maxBytes: number) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) fail('InvalidBackupFile');
  return readFile(path);
}

export function dpapi(bytes: Buffer, decrypt = false): Buffer {
  if (process.platform !== 'win32') fail('WindowsRequired');
  const operation = decrypt ? 'Unprotect' : 'Protect';
  const script = `$ErrorActionPreference='Stop'; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $entropy=[Text.Encoding]::UTF8.GetBytes('${FORMAT}'); $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], { input: bytes.toString('base64'), encoding: 'utf8', timeout: 30000, maxBuffer: 128 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) fail('DpapiFailed');
  return Buffer.from(result.stdout.trim(), 'base64');
}

async function readBackup(directory: string, protect: Protector, limits: Limits, visit?: ObjectVisitor) {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) fail('InvalidBackupDirectory');
  const receipt = JSON.parse((await boundedFile(resolve(directory, 'receipt.json'), 4096)).toString('utf8'));
  if (receipt.format !== FORMAT || typeof receipt.id !== 'string' || !/^[0-9a-f-]{36}$/.test(receipt.id)) fail('InvalidReceipt');
  const key = protect(await boundedFile(resolve(directory, 'key.dpapi'), 65536), true);
  try {
    if (key.length !== 32) fail('InvalidKey');
    const plainManifest = open(await boundedFile(resolve(directory, 'manifest.enc'), 4 * 1024 ** 2), key, `${receipt.id}/manifest.enc`);
    let manifest;
    try { manifest = JSON.parse(plainManifest.toString('utf8')); } finally { plainManifest.fill(0); }
    if (manifest.format !== FORMAT || manifest.id !== receipt.id || !Array.isArray(manifest.objects)) fail('InvalidManifest');
    validateInventory(manifest.objects, limits);
    const seenFiles = new Set<string>();
    let bytes = 0;
    for (const object of manifest.objects) {
      if (typeof object.file !== 'string' || !/^[0-9a-f]{8}\.enc$/.test(object.file) || seenFiles.has(object.file) || !/^[0-9a-f]{64}$/.test(object.sha256)) fail('InvalidManifest');
      if (!object.metadata || typeof object.metadata !== 'object' || Array.isArray(object.metadata) ||
        Object.entries(object.metadata).some(([name, value]) => !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) || typeof value !== 'string' || /[\r\n]/.test(value))) fail('InvalidManifest');
      for (const header of ['contentType', 'cacheControl', 'contentDisposition', 'contentEncoding', 'contentLanguage']) {
        if (object[header] !== undefined && (typeof object[header] !== 'string' || /[\r\n]/.test(object[header]))) fail('InvalidManifest');
      }
      seenFiles.add(object.file);
      const plain = open(await boundedFile(resolve(directory, object.file), limits.objectBytes + 36), key, `${receipt.id}/${object.file}`);
      try {
        if (plain.length !== object.size || sha(plain) !== object.sha256) fail('ObjectMismatch');
        if (visit) await visit(object, plain);
        bytes += plain.length;
      } finally { plain.fill(0); }
    }
    if (manifest.objects.length !== receipt.objects || bytes !== receipt.bytes) fail('ReceiptMismatch');
    return { verified: true, objects: manifest.objects.length, bytes };
  } finally { key.fill(0); }
}

export async function verifyBackup(directory: string, protect: Protector = dpapi, limits: Limits = LIMITS) {
  return readBackup(directory, protect, limits);
}

// Preflight the entire authenticated package before exposing any plaintext to a
// restore sink. The callback must finish using bytes before returning; zeroed
// buffers are never retained by this reader. Files are checked again per visit.
export async function visitVerifiedBackup(directory: string, visit: ObjectVisitor, protect: Protector = dpapi, limits: Limits = LIMITS) {
  await verifyBackup(directory, protect, limits);
  return readBackup(directory, protect, limits, visit);
}

export async function backupSource(source: Source, directory: string, protect: Protector = dpapi, limits: Limits = LIMITS) {
  const startedAt = new Date().toISOString();
  const entries = validateInventory(await source.list(), limits);
  // The directory must be new; an interrupted backup remains incomplete and is never overwritten.
  await mkdir(directory);
  const id = randomUUID();
  const key = randomBytes(32);
  try {
    await writeFile(resolve(directory, 'key.dpapi'), protect(key), { flag: 'wx' });
    const objects = [];
    let bytes = 0;
    for (const [index, entry] of entries.entries()) {
      const data = await source.get(entry);
      try {
        if (!Buffer.isBuffer(data.bytes) || data.bytes.length !== entry.size) fail('ObjectMismatch');
        const file = `${index.toString(16).padStart(8, '0')}.enc`;
        objects.push({ ...entry, file, sha256: sha(data.bytes), metadata: data.metadata, contentType: data.contentType, cacheControl: data.cacheControl, contentDisposition: data.contentDisposition, contentEncoding: data.contentEncoding, contentLanguage: data.contentLanguage });
        await writeFile(resolve(directory, file), seal(data.bytes, key, `${id}/${file}`), { flag: 'wx' });
        bytes += data.bytes.length;
      } finally { data.bytes.fill(0); }
    }
    const finalEntries = validateInventory(await source.list(), limits);
    if (JSON.stringify(entries) !== JSON.stringify(finalEntries)) fail('SourceChanged');
    const manifest = Buffer.from(JSON.stringify({ format: FORMAT, id, source: source.identity, startedAt, completedAt: new Date().toISOString(), objects }));
    try {
      if (manifest.length > 4 * 1024 ** 2 - 36) fail('ManifestLimit');
      await writeFile(resolve(directory, 'manifest.enc'), seal(manifest, key, `${id}/manifest.enc`), { flag: 'wx' });
    } finally { manifest.fill(0); }
    await writeFile(resolve(directory, 'receipt.json'), JSON.stringify({ format: FORMAT, id, objects: objects.length, bytes }), { flag: 'wx' });
  } finally { key.fill(0); }
  return verifyBackup(directory, protect, limits);
}

function configuredSource() {
  dotenv.config({ quiet: true });
  const endpoint = new URL(process.env.OBJECT_STORAGE_ENDPOINT ?? '');
  const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim();
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim();
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.r2.cloudflarestorage.com') || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/' || endpoint.port || !bucket || !accessKeyId || !secretAccessKey) fail('InvalidConfiguration');
  const client = new S3Client({ endpoint: endpoint.href, region: process.env.OBJECT_STORAGE_REGION?.trim() || 'auto', forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true', credentials: { accessKeyId, secretAccessKey }, maxAttempts: 1 });
  const source: Source = {
    identity: `${endpoint.origin}/${bucket}`,
    list: () => readInventory(client, bucket),
    get: (entry) => readObject(client, bucket, entry),
  };
  return { client, source };
}

async function main() {
  const mode = process.argv[2];
  if (mode === '--verify') {
    if (!process.argv[3] || process.argv.length !== 4) fail('Usage');
    const directory = resolve(process.argv[3]);
    if (dirname(directory) !== root) fail('BackupPathRequired');
    console.log(JSON.stringify(await verifyBackup(directory)));
    return;
  }
  if (process.argv.length !== 3 || !['--inventory', '--backup'].includes(mode ?? '')) fail('Usage');
  if (mode === '--backup' && (process.platform !== 'win32' || process.env.ALLOW_READONLY_R2_BACKUP !== 'true')) fail('BackupOptInRequired');
  if (mode === '--inventory' && process.env.ALLOW_READONLY_R2_INVENTORY !== 'true') fail('InventoryOptInRequired');
  const { client, source } = configuredSource();
  try {
    if (mode === '--inventory') {
      const entries = await source.list();
      console.log(JSON.stringify({ objects: entries.length, bytes: entries.reduce((sum, item) => sum + item.size, 0), largestBytes: Math.max(0, ...entries.map(item => item.size)), limits: LIMITS, objectContentsRead: false }));
    } else {
      await mkdir(root, { recursive: true });
      const directory = resolve(root, `r2-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
      const result = await backupSource(source, directory);
      await writeFile(resolve(directory, 'verified.json'), JSON.stringify({ ...result, verifiedAt: new Date().toISOString(), encryption: 'AES-256-GCM; Windows DPAPI CurrentUser key', plaintextWrittenToDisk: false, cloudWrites: false }), { flag: 'wx' });
      console.log(JSON.stringify({ ...result, directory, cloudWrites: false }));
    }
  } finally { client.destroy(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(JSON.stringify({ errorType: error.name, code: /^[A-Za-z0-9_]+$/.test(error.code ?? '') ? error.code : undefined })); process.exitCode = 1; });
}
