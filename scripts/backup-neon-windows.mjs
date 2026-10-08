import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Client } from 'pg';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ quiet: true });
if (process.platform !== 'win32' || process.env.ALLOW_READONLY_CLOUD_BACKUP !== 'true') throw new Error('Windows and explicit read-only backup opt-in required');
const url = new URL(process.env.DATABASE_URL);
if (!url.hostname.endsWith('.neon.tech') || url.protocol !== 'postgresql:') throw new Error('Expected configured Neon PostgreSQL database');
url.hostname = url.hostname.replace('-pooler.', '.');
const backupId = randomUUID();
const containerName = `toeic-cloud-restore-${backupId.slice(0, 8)}`;
const label = `toeic.release.restore-id=${backupId}`;
const database = new Client({ connectionString: url.href, connectionTimeoutMillis: 15000, query_timeout: 20000 });
const backupDirectory = resolve(__dirname, '../Test/backups');
const backupFile = resolve(backupDirectory, `neon-${new Date().toISOString().replaceAll(':', '-')}.dpapi`);
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
let stage = 'connect'; let containerStarted = false;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { timeout: 120000, maxBuffer: 100 * 1024 * 1024, windowsHide: true, ...options });
  if (result.error || result.status !== 0) throw Object.assign(new Error('Operation failed'), { operation: command, exitStatus: result.status });
  return result.stdout;
}
function protect(buffer, decrypt = false) {
  const operation = decrypt ? 'Unprotect' : 'Protect';
  const script = `$ErrorActionPreference='Stop'; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $entropy=[Text.Encoding]::UTF8.GetBytes('toeic-mini-trainer.backup.v1'); $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  return Buffer.from(run('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], { input: buffer.toString('base64'), encoding: 'utf8' }).trim(), 'base64');
}
async function main() {
  const started = Date.now();
  await database.connect();
  await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await database.query("SET LOCAL statement_timeout = '20s'");
  const version = (await database.query("SELECT current_setting('server_version_num') AS version")).rows[0].version;
  if (Number(version) < 180000 || Number(version) >= 190000) throw new Error('Expected PostgreSQL 18');
  const snapshot = (await database.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
  const tables = (await database.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows.map((row) => row.tablename);
  if (!tables.length || tables.some((table) => !/^[a-z_][a-z0-9_]*$/.test(table))) throw new Error('Unexpected table names');
  const rowCounts = {};
  for (const table of tables) rowCounts[table] = (await database.query(`SELECT count(*)::text AS count FROM public."${table}"`)).rows[0].count;
  stage = 'read-only pg_dump';
  const dumpEnvironment = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '15', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=60000' };
  const dumpArgs = ['run', '--rm', '--env', 'PGHOST', '--env', 'PGPORT', '--env', 'PGDATABASE', '--env', 'PGUSER', '--env', 'PGPASSWORD', '--env', 'PGSSLMODE', '--env', 'PGCONNECT_TIMEOUT', '--env', 'PGOPTIONS', 'postgres:18', 'pg_dump', '--format=custom', '--no-owner', '--no-privileges', '--no-publications', '--no-subscriptions', '--lock-wait-timeout=10000', `--snapshot=${snapshot}`];
  const dump = run('docker', dumpArgs, { env: dumpEnvironment });
  if (dump.subarray(0, 5).toString() !== 'PGDMP') throw new Error('Invalid custom archive');
  await database.query('COMMIT');
  await database.end();
  stage = 'encrypt backup';
  mkdirSync(backupDirectory, { recursive: true });
  const encrypted = protect(dump);
  writeFileSync(backupFile, encrypted, { flag: 'wx' });
  const restoredDump = protect(readFileSync(backupFile), true);
  if (hash(restoredDump) !== hash(dump)) throw new Error('Encrypted backup roundtrip failed');
  stage = 'isolated restore';
  run('docker', ['run', '--detach', '--name', containerName, '--label', label, '--network', 'none', '--memory', '512m', '--tmpfs', '/var/lib/postgresql:rw,size=256m', '--env', 'POSTGRES_USER=restore', '--env', 'POSTGRES_PASSWORD=isolated-restore-fixture', '--env', 'POSTGRES_DB=toeic_backup_verify', 'postgres:18']);
  containerStarted = true;
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const check = spawnSync('docker', ['exec', containerName, 'pg_isready', '-U', 'restore', '-d', 'toeic_backup_verify'], { windowsHide: true, timeout: 10000 });
    if (check.status === 0) { ready = true; break; }
    await new Promise((done) => setTimeout(done, 1000));
  }
  if (!ready) throw new Error('Restore database not ready');
  run('docker', ['exec', '-i', containerName, 'pg_restore', '--username=restore', '--dbname=toeic_backup_verify', '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges'], { input: restoredDump });
  for (const table of tables) {
    const count = run('docker', ['exec', containerName, 'psql', '-X', '-A', '-t', '-U', 'restore', '-d', 'toeic_backup_verify', '-c', `SELECT count(*)::text FROM public."${table}"`], { encoding: 'utf8' }).trim();
    if (count !== rowCounts[table]) throw new Error('Restored row count mismatch');
  }
  const manifest = { createdAt: new Date().toISOString(), sourceVersion: version, tableCount: tables.length, rowCounts, encryptedFile: backupFile, encryptedSha256: hash(encrypted), plaintextSha256: hash(dump), encryption: 'Windows DPAPI CurrentUser; entropy toeic-mini-trainer.backup.v1', restoreNetwork: 'none', restoreStorage: 'tmpfs', verified: true, elapsedSeconds: (Date.now() - started) / 1000, excludesObjectStorage: true };
  writeFileSync(`${backupFile}.json`, JSON.stringify(manifest, null, 2), { flag: 'wx' });
  dump.fill(0); restoredDump.fill(0);
  console.log(JSON.stringify({ verified: true, sourceVersion: version, tableCount: tables.length, elapsedSeconds: manifest.elapsedSeconds, encryptedFile: backupFile, objectStorageVerified: false }));
}
main().catch((error) => { console.error(JSON.stringify({ stage, errorType: error.name, code: error.code, operation: error.operation, exitStatus: error.exitStatus })); process.exitCode = 1; }).finally(async () => {
  await database.end().catch(() => {});
  if (containerStarted) {
    const inspected = spawnSync('docker', ['inspect', '--format', '{{index .Config.Labels "toeic.release.restore-id"}}', containerName], { encoding: 'utf8', windowsHide: true });
    if (inspected.status === 0 && inspected.stdout.trim() === backupId) run('docker', ['rm', '--force', containerName]);
    else { console.error('Cannot verify ownership of restore container; cleanup skipped'); process.exitCode = 1; }
  }
});
