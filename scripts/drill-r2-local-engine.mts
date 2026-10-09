import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dpapi, verifyBackup } from './backup-r2-windows.mts';
import { verifyLocalRestore } from './verify-r2-local-restore.mts';
import { dockerLocalHttp } from './lib/docker-local-http.mts';
import { HttpRequest } from '@smithy/core/transport';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../Test/backups');
function fail(code: string): never { throw Object.assign(new Error(code), { code }); }
function run(args: string[]) {
  const result = spawnSync('docker', args, { windowsHide: true, timeout: 90000, maxBuffer: 1024 ** 2 });
  if (result.error || result.status !== 0) fail('LocalEngineOperationFailed');
  return (args[0] === 'logs' ? Buffer.concat([result.stdout, result.stderr]) : result.stdout).toString('utf8').trim();
}
function cleanupOwned(type: 'container' | 'network', name: string, id: string) {
  const inspected = spawnSync('docker', [type, 'inspect', '--format', type === 'container'
    ? '{{index .Config.Labels "toeic.release.local-engine-id"}}'
    : '{{index .Labels "toeic.release.local-engine-id"}}', name], { windowsHide: true, encoding: 'utf8', timeout: 15000 });
  if (inspected.status === 1 && /No such (object|container|network)/i.test(inspected.stderr ?? '')) return true;
  if (inspected.status !== 0 || inspected.stdout.trim() !== id) return false;
  try { run(type === 'container' ? ['rm', '--force', name] : ['network', 'rm', name]); return true; }
  catch { return false; }
}

async function main() {
  if (process.platform !== 'win32' || process.env.ALLOW_LOCAL_R2_ENGINE_DRILL !== 'true' || process.argv.length !== 3) fail('LocalEngineOptInRequired');
  const directory = resolve(process.argv[2]);
  if (dirname(directory) !== root || !/^r2-[0-9TZ.\-]+-[0-9a-f]{8}$/.test(basename(directory))) fail('BackupPathRequired');
  for (const path of [root, directory]) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) fail('BackupPathRequired');
  }
  const preflight = await verifyBackup(directory);
  if (preflight.bytes > 128 * 1024 ** 2) fail('LocalEngineDrillLimit');
  const id = randomUUID();
  const container = `toeic-media-drill-${id.slice(0, 8)}`, network = `toeic-media-net-${id.slice(0, 8)}`;
  const helper = `toeic-media-relay-${id.slice(0, 8)}`;
  const label = `toeic.release.local-engine-id=${id}`;
  // Signing-only loopback endpoint. Actual bytes travel through Docker exec to
  // the fixed engine alias on an internal network, with no published host port.
  const endpoint = 'http://127.0.0.1:9000';
  const transport = dockerLocalHttp(helper);
  let networkAttempted = false, containerAttempted = false, helperAttempted = false, cleaned = false;
  let result: Awaited<ReturnType<typeof verifyLocalRestore>> | undefined;
  let failure: unknown;
  const started = Date.now();
  try {
    networkAttempted = true;
    run(['network', 'create', '--internal', '--label', label, network]);
    if (run(['network', 'inspect', '--format', '{{.Internal}}', network]) !== 'true') fail('InternalNetworkRequired');
    containerAttempted = true;
    run(['run', '--pull', 'never', '--detach', '--name', container, '--label', label,
      '--network', network, '--network-alias', 'toeic-minio', '--memory', '512m', '--cpus', '1',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true',
      '--tmpfs', '/data:rw,size=1g,mode=1777', '--tmpfs', '/tmp:rw,size=16m,mode=1777',
      '--env', 'MINIO_ROOT_USER=toeic-local-restore', '--env', 'MINIO_ROOT_PASSWORD=local-restore-only',
      'cgr.dev/chainguard/minio:latest', '--anonymous', '--json', '--certs-dir', '/tmp/minio-certs',
      'server', '/data', '--address', ':9000', '--console-address', ':9001']);
    helperAttempted = true;
    run(['run', '--pull', 'never', '--detach', '--name', helper, '--label', label,
      '--network', network, '--memory', '64m', '--cpus', '1', '--read-only', '--user', '65534:65534',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true', '--entrypoint', 'bash',
      'postgres:18', '-c', 'sleep 3600']);
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const health = await transport.handle(new HttpRequest({ protocol: 'http:', hostname: '127.0.0.1', port: 9000,
          method: 'GET', path: '/minio/health/live', headers: { host: '127.0.0.1:9000' } }), { abortSignal: AbortSignal.timeout(2000) });
        health.response.body.destroy();
        if (health.response.statusCode === 200) { ready = true; break; }
      } catch { /* Wait for this specific newly created engine, never change targets. */ }
      await new Promise(done => setTimeout(done, 1000));
    }
    if (!ready) {
      // No media has been restored at this point. Keep anonymous startup-only
      // diagnostics locally so a failed engine can be diagnosed after cleanup.
      const logs = run(['logs', '--tail', '25', container]);
      await writeFile(resolve(root, `engine-startup-${id}.txt`), logs, { flag: 'wx' });
      fail('LocalEngineNotReady');
    }
    result = await verifyLocalRestore(directory, endpoint, dpapi, transport);
  } catch (error) { failure = error; }
  finally {
    const helperCleaned = !helperAttempted || cleanupOwned('container', helper, id);
    const containerCleaned = !containerAttempted || cleanupOwned('container', container, id);
    const networkCleaned = !networkAttempted || cleanupOwned('network', network, id);
    cleaned = helperCleaned && containerCleaned && networkCleaned;
    if (!cleaned) failure = Object.assign(new Error('LocalEngineCleanupFailed'), { code: 'LocalEngineCleanupFailed' });
  }
  if (failure) throw failure;
  if (!result?.verified || !cleaned) fail('LocalEngineVerificationFailed');
  const receipt = { ...result, engine: 'MinIO local container', mediaStorage: 'tmpfs',
    network: 'internal; Docker exec transport; no published host ports', engineCleaned: cleaned,
    cloudRequests: 0, backup: basename(directory), checkedAt: new Date().toISOString(), elapsedSeconds: (Date.now() - started) / 1000 };
  const receiptPath = resolve(root, `engine-drill-${id}.json`);
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ ...receipt, receiptPath }));
}
main().catch(error => {
  // Suppress S3/Docker bodies, private object keys, signed headers and decoded metadata.
  console.error(JSON.stringify({ errorType: error.name, code: /^[A-Za-z0-9_]+$/.test(error.code ?? '') ? error.code : undefined }));
  process.exitCode = 1;
});
