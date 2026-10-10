import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import test from 'node:test';
import { backupSource, visitVerifiedBackup, type Protector, type Source } from '../scripts/backup-r2-windows.mts';
import { validateLocalRestoreEndpoint, verifyLocalRestore } from '../scripts/verify-r2-local-restore.mts';
import { restoreObjectStorage } from './helpers/restore-object-storage';

const protect: Protector = bytes => Buffer.from(bytes);
const source: Source = {
  identity: 'offline-fixture',
  list: async () => ['private/âm thanh 1.mp3', 'empty.pdf'].map((key, i) => ({ key, size: i ? 0 : 256, etag: `"fixture-${i}"`, modified: '2026-10-09T00:00:00Z' })),
  get: async entry => ({ bytes: Buffer.alloc(entry.size, 71), metadata: { owner: 'fixture', checksum: 'example', 'source.file': 'fixture' },
    contentType: 'audio/mpeg', cacheControl: 'private, max-age=20', contentDisposition: 'inline', contentLanguage: 'en' }),
};
async function fixture(run: (directory: string) => Promise<void>) {
  const parent = await mkdtemp(resolve(tmpdir(), 'toeic-r2-restore-'));
  try { const directory = resolve(parent, 'backup'); await backupSource(source, directory, protect); await run(directory); }
  finally {
    assert.equal(dirname(parent), resolve(tmpdir()));
    assert.ok(basename(parent).startsWith('toeic-r2-restore-'));
    await rm(parent, { recursive: true, force: true });
  }
}
test('local restore rejects cloud, DNS, userinfo, path and ambiguous destinations before network use', () => {
  for (const endpoint of ['https://account.r2.cloudflarestorage.com', 'http://localhost:9000', 'http://127.0.0.1',
    'http://127.0.0.1:9000/bucket', 'http://user:password@127.0.0.1:9000', 'http://127.0.0.1:9000/?target=cloud', 'http://[::1]:9000']) {
    assert.throws(() => validateLocalRestoreEndpoint(endpoint));
  }
  assert.equal(validateLocalRestoreEndpoint('http://127.0.0.1:9000/'), 'http://127.0.0.1:9000');
});
test('restores encrypted media over real loopback S3 HTTP, verifies bytes/metadata/range and cleans its bucket', async () => {
  await fixture(async directory => {
    const storage = await restoreObjectStorage();
    try {
      const result = await verifyLocalRestore(directory, storage.endpoint, protect);
      assert.deepEqual(result, { verified: true, objects: 2, bytes: 256, rangeReads: 1, metadataChecked: true, cleaned: true, cloudWrites: false });
      assert.equal(storage.counts.put, 2); assert.equal(storage.counts.get, 3);
      assert.equal(storage.counts.deleteObject, 2); assert.equal(storage.counts.deleteBucket, 1);
      assert.equal(storage.buckets.size, 0);
    } finally { await storage.close(); }
  });
});
test('corruption in a later encrypted object prevents ALL restore writes and visitor calls', async () => {
  await fixture(async directory => {
    const file = resolve(directory, '00000001.enc');
    const bytes = await readFile(file); bytes[bytes.length - 1] ^= 1; await writeFile(file, bytes);
    const storage = await restoreObjectStorage();
    let visits = 0;
    try {
      await assert.rejects(verifyLocalRestore(directory, storage.endpoint, protect));
      await assert.rejects(visitVerifiedBackup(directory, async () => { visits++; }, protect));
      assert.equal(storage.counts.create, 0); assert.equal(storage.counts.put, 0); assert.equal(visits, 0);
    } finally { await storage.close(); }
  });
});
test('restored byte/metadata/range corruption or failed PUT fails the drill and cleans only the new bucket', async () => {
  for (const options of [{ corruptRead: true }, { corruptMetadata: true }, { corruptRange: true }, { rejectPut: true }]) {
    await fixture(async directory => {
      const storage = await restoreObjectStorage(options);
      try {
        await assert.rejects(verifyLocalRestore(directory, storage.endpoint, protect));
        assert.equal(storage.buckets.size, 0); assert.equal(storage.counts.deleteBucket, 1);
      } finally { await storage.close(); }
    });
  }
});
test('ambiguous failed PUT does not delete an unacknowledged object or claim successful cleanup', async () => {
  await fixture(async directory => {
    const storage = await restoreObjectStorage({ ambiguousPut: true });
    try {
      await assert.rejects(verifyLocalRestore(directory, storage.endpoint, protect), { code: 'LocalRestoreCleanupFailed' });
      assert.equal(storage.counts.deleteObject, 0);
      assert.equal(storage.buckets.size, 1);
    } finally { await storage.close(); }
  });
});
test('bucket creation collision does not delete or write objects', async () => {
  await fixture(async directory => {
    const storage = await restoreObjectStorage({ collision: true });
    try {
      await assert.rejects(verifyLocalRestore(directory, storage.endpoint, protect));
      assert.equal(storage.counts.put, 0); assert.equal(storage.counts.deleteBucket, 0); assert.equal(storage.counts.deleteObject, 0);
    } finally { await storage.close(); }
  });
});
test('existing bucket HEAD 200 prevents creation and all object/deletion operations', async () => {
  await fixture(async directory => {
    const storage = await restoreObjectStorage({ headCollision: true });
    try {
      await assert.rejects(verifyLocalRestore(directory, storage.endpoint, protect), { code: 'LocalBucketAlreadyExists' });
      assert.equal(storage.counts.create, 0); assert.equal(storage.counts.put, 0);
      assert.equal(storage.counts.deleteBucket, 0); assert.equal(storage.counts.deleteObject, 0);
    } finally { await storage.close(); }
  });
});
test('cleanup failure cannot report successful recovery', async () => {
  await fixture(async directory => {
    const storage = await restoreObjectStorage({ rejectDelete: true });
    try { await assert.rejects(verifyLocalRestore(directory, storage.endpoint, protect), { code: 'LocalRestoreCleanupFailed' }); }
    finally { await storage.close(); }
  });
});
test('verified backup visitor zeroes plaintext after success and callback failure', async () => {
  await fixture(async directory => {
    const retained: Buffer[] = [];
    await visitVerifiedBackup(directory, async (_object, bytes) => { retained.push(bytes); }, protect);
    assert.equal(retained.length, 2);
    assert.ok(retained.every(bytes => bytes.every(byte => byte === 0)));
    let failed: Buffer | undefined;
    await assert.rejects(visitVerifiedBackup(directory, async (_object, bytes) => {
      if (bytes.length > 0) { failed = bytes; throw new Error('SinkFailed'); }
    }, protect), { message: 'SinkFailed' });
    assert.ok(failed && failed.length > 0 && failed.every(byte => byte === 0));
  });
});
