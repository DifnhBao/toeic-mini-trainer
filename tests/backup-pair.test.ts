import assert from 'node:assert/strict';
import test from 'node:test';
import { compareBackupPair } from '../scripts/lib/backup-pair.mts';
import { validatePairPaths } from '../scripts/verify-backup-pair-windows.mts';
import { resolve } from 'node:path';

const asset = { objectKey: 'private/audio.mp3', sizeBytes: 10, contentType: 'audio/mpeg', etag: 'etag-one' };
const object = { key: asset.objectKey, size: 10, contentType: 'Audio/Mpeg', etag: '"etag-one"' };

test('a verified pair covers every READY asset version and allows unreferenced backup objects', () => {
  const result = compareBackupPair([asset, asset], [object, { ...object, key: 'pending/unused.mp3' }], 0);
  assert.equal(result.verified, true); assert.equal(result.matchedAssets, 2);
  assert.equal(result.extraObjects, 1); assert.equal(result.atomicSnapshot, false);
  assert.ok(!JSON.stringify(result).includes('private/audio.mp3'));
});
test('same size and filename with different bytes/version does not verify', () => {
  const result = compareBackupPair([asset], [{ ...object, etag: '"etag-two"' }], 0);
  assert.equal(result.verified, false); assert.equal(result.versionMismatches, 1);
});
test('missing media, changed size or MIME prevents a successful recovery claim', () => {
  assert.equal(compareBackupPair([asset], [], 0).missingObjects, 1);
  for (const changed of [{ ...object, size: 11 }, { ...object, contentType: 'application/pdf' }, { ...object, contentType: undefined }]) {
    assert.equal(compareBackupPair([asset], [changed], 0).verified, false);
  }
});
test('missing DB version and legacy local URLs remain explicit unverified gaps', () => {
  const result = compareBackupPair([{ ...asset, etag: null }], [object], 2);
  assert.equal(result.verified, false); assert.equal(result.unversionedAssets, 1); assert.equal(result.legacyLinks, 2);
});
test('rejects ambiguous inventories, oversized sets and invalid byte counts', () => {
  for (const objects of [[object, object], [{ ...object, size: -1 }], Array.from({ length: 1001 }, (_, i) => ({ ...object, key: String(i) }))]) {
    assert.throws(() => compareBackupPair([asset], objects, 0));
  }
  assert.throws(() => compareBackupPair([{ ...asset, sizeBytes: NaN }], [object], 0));
  assert.throws(() => compareBackupPair([], [], -1));
});
test('offline pair verifier accepts only explicit backup files directly in the project backup directory', () => {
  const database = resolve('Test/backups/neon-2026-10-08T04-13-59.877Z.dpapi');
  const media = resolve('Test/backups/r2-2026-10-08T10-21-46.688Z-7e03760b');
  assert.deepEqual(validatePairPaths(database, media), { database, media });
  for (const invalid of [resolve('Test/other.dpapi'), resolve('Test/backups/nested/neon-2026-10-08T04-13-59.877Z.dpapi'), resolve('Test/backups/other.dpapi')]) {
    assert.throws(() => validatePairPaths(invalid, media));
  }
  assert.throws(() => validatePairPaths(database, resolve('Test/backups/../../somewhere')));
});
