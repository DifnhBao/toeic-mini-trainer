import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { dpapi, visitVerifiedBackup } from './backup-r2-windows.mts';
import { compareBackupPair, type BackedObject } from './lib/backup-pair.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../Test/backups');
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function fail(code: string): never { throw Object.assign(new Error(code), { code }); }
function run(args: string[], input?: Buffer) {
  const result = spawnSync('docker', args, { input, windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 ** 2 });
  // Docker/PostgreSQL diagnostics can include restored private values. Do not log them.
  if (result.error || result.status !== 0) fail('DockerOperationFailed');
  return result.stdout as Buffer;
}
export function validatePairPaths(databasePath: string, mediaPath: string) {
  const database = resolve(databasePath), media = resolve(mediaPath);
  if (dirname(database) !== root || dirname(media) !== root ||
    !/^neon-[0-9TZ.\-]+\.dpapi$/.test(basename(database)) ||
    !/^r2-[0-9TZ.\-]+-[0-9a-f]{8}$/.test(basename(media))) fail('BackupPathRequired');
  return { database, media };
}
async function boundedFile(path: string, maximum: number) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) fail('InvalidBackupFile');
  return readFile(path);
}
function decryptDatabase(bytes: Buffer) {
  const script = "$ErrorActionPreference='Stop'; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $entropy=[Text.Encoding]::UTF8.GetBytes('toeic-mini-trainer.backup.v1'); $result=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))";
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: bytes.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 150 * 1024 ** 2,
  });
  if (result.error || result.status !== 0) fail('DatabaseDecryptFailed');
  return Buffer.from(result.stdout.trim(), 'base64');
}
const manifestSchema = z.object({
  sourceVersion: z.string().regex(/^18[0-9]{4}$/), tableCount: z.number().int().min(1).max(100),
  rowCounts: z.record(z.string().regex(/^[a-z_][a-z0-9_]*$/), z.string().regex(/^[0-9]+$/)),
  encryptedFile: z.string(), encryptedSha256: z.string().regex(/^[a-f0-9]{64}$/),
  plaintextSha256: z.string().regex(/^[a-f0-9]{64}$/), verified: z.literal(true),
});
const snapshotSchema = z.object({
  assets: z.array(z.object({ objectKey: z.string().min(1).max(1024), sizeBytes: z.number().int().min(0),
    contentType: z.string().min(1), etag: z.string().nullable() })).max(1000),
  legacyLinks: z.number().int().min(0),
});

async function verifyPair(databasePath: string, mediaPath: string) {
  if (process.platform !== 'win32' || process.env.ALLOW_LOCAL_BACKUP_PAIR_VERIFY !== 'true') fail('LocalPairOptInRequired');
  const paths = validatePairPaths(databasePath, mediaPath);
  for (const path of [root, paths.media]) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) fail('InvalidBackupDirectory');
  }
  const manifest = manifestSchema.parse(JSON.parse((await boundedFile(`${paths.database}.json`, 65536)).toString('utf8')));
  if (resolve(manifest.encryptedFile).toLowerCase() !== paths.database.toLowerCase() || Object.keys(manifest.rowCounts).length !== manifest.tableCount) fail('InvalidDatabaseManifest');
  const encrypted = await boundedFile(paths.database, 110 * 1024 ** 2);
  if (sha(encrypted) !== manifest.encryptedSha256) fail('DatabaseArchiveMismatch');
  const dump = decryptDatabase(encrypted);
  const id = randomUUID(), container = `toeic-pair-restore-${id.slice(0, 8)}`;
  const objects: BackedObject[] = [];
  let attempted = false, cleaned = false;
  let result: ReturnType<typeof compareBackupPair> | undefined;
  let failure: unknown;
  const started = Date.now();
  try {
    if (dump.length > 100 * 1024 ** 2 || dump.subarray(0, 5).toString() !== 'PGDMP' || sha(dump) !== manifest.plaintextSha256) fail('DatabaseArchiveMismatch');
    // No cloud clients or .env. Media reads are authenticated local decryptions.
    await visitVerifiedBackup(paths.media, async object => {
      objects.push({ key: object.key, size: object.size, etag: object.etag, contentType: object.contentType });
    }, dpapi);
    attempted = true;
    run(['run', '--pull', 'never', '--detach', '--name', container, '--label', `toeic.release.pair-id=${id}`,
      '--network', 'none', '--memory', '512m', '--tmpfs', '/var/lib/postgresql:rw,size=256m',
      '--env', 'POSTGRES_USER=restore', '--env', 'POSTGRES_PASSWORD=isolated-restore-fixture',
      '--env', 'POSTGRES_DB=toeic_backup_verify', 'postgres:18']);
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const check = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'restore', '-d', 'toeic_backup_verify'], { windowsHide: true, timeout: 10000 });
      if (check.status === 0) { ready = true; break; }
      await new Promise(done => setTimeout(done, 1000));
    }
    if (!ready) fail('RestoreNotReady');
    run(['exec', '-i', container, 'pg_restore', '--username=restore', '--dbname=toeic_backup_verify',
      '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges'], dump);
    const query = (sql: string) => run(['exec', container, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'restore', '-d', 'toeic_backup_verify', '-c', sql]).toString('utf8').trim();
    const tables = z.array(z.string()).parse(JSON.parse(query("SELECT coalesce(json_agg(tablename), '[]') FROM pg_tables WHERE schemaname='public'")));
    if (JSON.stringify(tables.sort()) !== JSON.stringify(Object.keys(manifest.rowCounts).sort())) fail('RestoredTablesMismatch');
    for (const [table, count] of Object.entries(manifest.rowCounts)) {
      if (query(`SELECT count(*)::text FROM public."${table}"`) !== count) fail('RestoredRowsMismatch');
    }
    const snapshot = snapshotSchema.parse(JSON.parse(query(`SELECT json_build_object(
      'assets', (SELECT coalesce(json_agg(row_to_json(a)), '[]'::json) FROM (
        SELECT "objectKey", "sizeBytes", "contentType", etag FROM uploaded_assets WHERE status='READY' LIMIT 1001
      ) a),
      'legacyLinks', (SELECT count(*) FROM question_groups WHERE coalesce("audioUrl", '') <> '' OR coalesce("imageUrl", '') <> '')
    )`)));
    result = compareBackupPair(snapshot.assets, objects, snapshot.legacyLinks);
  } catch (error) { failure = error; }
  finally {
    dump.fill(0);
    if (attempted) {
      const inspected = spawnSync('docker', ['inspect', '--format', '{{index .Config.Labels "toeic.release.pair-id"}}', container], { windowsHide: true, encoding: 'utf8', timeout: 15000 });
      if (inspected.status === 0 && inspected.stdout.trim() === id) {
        try { run(['rm', '--force', container]); cleaned = true; } catch { failure = Object.assign(new Error('RestoreCleanupFailed'), { code: 'RestoreCleanupFailed' }); }
      } else if (inspected.status === 1 && /No such (object|container)/i.test(inspected.stderr ?? '')) {
        cleaned = true;
      } else failure = Object.assign(new Error('RestoreCleanupFailed'), { code: 'RestoreCleanupFailed' });
    }
  }
  if (failure) throw failure;
  if (!result || !cleaned) fail('RestoreCleanupFailed');
  const receipt = { ...result, databaseTablesChecked: manifest.tableCount, encryptedDatabaseSha256: manifest.encryptedSha256,
    databaseBackup: basename(paths.database), mediaBackup: basename(paths.media),
    restoreNetwork: 'none', restoreStorage: 'tmpfs', cleaned, cloudRequests: 0,
    checkedAt: new Date().toISOString(), elapsedSeconds: (Date.now() - started) / 1000 };
  const receiptPath = resolve(root, `pair-${id}.json`);
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  return { ...receipt, receiptPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    if (process.argv.length !== 4) fail('Usage');
    const result = await verifyPair(process.argv[2], process.argv[3]);
    console.log(JSON.stringify(result));
    if (!result.verified) process.exitCode = 1;
  })().catch(error => {
    // Never emit decrypted assets, auth rows, dump output, endpoints or credentials.
    console.error(JSON.stringify({ errorType: error.name, code: /^[A-Za-z0-9_]+$/.test(error.code ?? '') ? error.code : undefined }));
    process.exitCode = 1;
  });
}
