import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import test from 'node:test';
import type { S3Client } from '@aws-sdk/client-s3';
import { backupSource, dpapi, readInventory, readObject, validateInventory, verifyBackup, type Entry, type Protector, type Source } from '../scripts/backup-r2-windows.mts';

const entry = (key: string, size = 4): Entry => ({ key, size, etag: `"etag-${key}"`, modified: '2026-10-08T10:00:00.000Z' });
// Portable tests inject a key wrapper; the separate Windows test uses actual DPAPI.
const fixtureProtector: Protector = (bytes) => Buffer.from(bytes);
async function fixture(run: (directory: string) => Promise<void>) {
  const parent = await mkdtemp(resolve(tmpdir(), 'toeic-r2-fixture-'));
  try { await run(resolve(parent, 'backup')); }
  finally {
    assert.equal(dirname(parent), resolve(tmpdir()));
    assert.ok(basename(parent).startsWith('toeic-r2-fixture-'));
    await rm(parent, { recursive: true, force: true });
  }
}
function source(entries = [entry('../private/user-secret.pdf'), entry('audio/giọng nói.wav', 0)]): Source {
  return {
    identity: 'offline-fixture', list: async () => entries.map(item => ({ ...item })),
    get: async item => ({ bytes: Buffer.alloc(item.size, 77), metadata: { private: 'private-metadata-value' }, contentType: 'application/pdf' }),
  };
}

test('R2 backup roundtrips bytes/empty files and keeps keys, content and metadata encrypted', async () => {
  await fixture(async directory => {
    const result = await backupSource(source(), directory, fixtureProtector);
    assert.deepEqual(result, { verified: true, objects: 2, bytes: 4 });
    assert.deepEqual(await verifyBackup(directory, fixtureProtector), result);
    const receipt = await readFile(resolve(directory, 'receipt.json'), 'utf8');
    const manifest = await readFile(resolve(directory, 'manifest.enc'));
    assert.ok(!receipt.includes('user-secret') && !manifest.includes(Buffer.from('user-secret')));
    assert.ok(!manifest.includes(Buffer.from('private-metadata-value')));
    await assert.rejects(access(resolve(dirname(directory), 'private/user-secret.pdf')));
    await assert.rejects(backupSource(source(), directory, fixtureProtector));
  });
});

test('R2 verification rejects corruption, a truncated object and a wrong unwrapped key', async () => {
  await fixture(async directory => {
    await backupSource(source([entry('audio', 12)]), directory, fixtureProtector);
    const path = resolve(directory, '00000000.enc');
    const original = await readFile(path);
    const altered = Buffer.from(original);
    altered[altered.length - 1] ^= 1;
    await writeFile(path, altered);
    await assert.rejects(verifyBackup(directory, fixtureProtector));
    await writeFile(path, original.subarray(0, 20));
    await assert.rejects(verifyBackup(directory, fixtureProtector));
    await writeFile(path, original);
    await assert.rejects(verifyBackup(directory, () => randomBytes(32)));
    const manifestPath = resolve(directory, 'manifest.enc');
    const manifest = await readFile(manifestPath);
    manifest[30] ^= 1;
    await writeFile(manifestPath, manifest);
    await assert.rejects(verifyBackup(directory, fixtureProtector));
  });
});

test('R2 verification rejects swapping two valid encrypted objects and forged receipt totals', async () => {
  await fixture(async directory => {
    await backupSource(source([entry('a'), entry('b')]), directory, fixtureProtector);
    const a = resolve(directory, '00000000.enc');
    const b = resolve(directory, '00000001.enc');
    const original = await readFile(a);
    await writeFile(a, await readFile(b));
    await assert.rejects(verifyBackup(directory, fixtureProtector));
    await writeFile(a, original);
    const receiptPath = resolve(directory, 'receipt.json');
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    await writeFile(receiptPath, JSON.stringify({ ...receipt, bytes: receipt.bytes + 1 }));
    await assert.rejects(verifyBackup(directory, fixtureProtector));
  });
});

test('R2 source changes or read errors leave an incomplete backup, never a success receipt', async () => {
  for (const condition of ['changed-list', 'changed-size', 'failed-read']) {
    await fixture(async directory => {
      const original = source([entry('audio')]);
      let reads = 0;
      if (condition === 'changed-list') original.list = async () => [entry(reads++ ? 'new-audio' : 'audio')];
      if (condition === 'changed-size') original.get = async () => ({ bytes: Buffer.alloc(3), metadata: {} });
      if (condition === 'failed-read') original.get = async () => { throw new Error('FixtureReadFailed'); };
      await assert.rejects(backupSource(original, directory, fixtureProtector));
      await assert.rejects(access(resolve(directory, 'receipt.json')));
      await assert.rejects(verifyBackup(directory, fixtureProtector));
    });
  }
});

test('R2 inventory enforces size/count bounds and rejects duplicate or incomplete entries', () => {
  assert.throws(() => validateInventory([entry('a'), entry('a')]));
  assert.throws(() => validateInventory([entry('a', -1)]));
  assert.throws(() => validateInventory([entry('a', 129 * 1024 ** 2)]));
  assert.throws(() => validateInventory([{ ...entry('a'), etag: '' }]));
  assert.throws(() => validateInventory([{ ...entry('a'), modified: 'invalid' }]));
  assert.throws(() => validateInventory([entry('a'), entry('b')], { objects: 1, bytes: 10, objectBytes: 10 }));
  assert.throws(() => validateInventory([entry('a'), entry('b')], { objects: 2, bytes: 7, objectBytes: 10 }));
});

test('R2 listing follows pagination without reading object contents, rejects token loops', async () => {
  const calls: Record<string, unknown>[] = [];
  let page = 0;
  const client = { send: async (command: { input: Record<string, unknown> }) => {
    calls.push(command.input);
    const value = entry(page++ ? 'b' : 'a');
    return { Contents: [{ Key: value.key, Size: value.size, ETag: value.etag, LastModified: new Date(value.modified) }], IsTruncated: page === 1, NextContinuationToken: page === 1 ? 'second-page' : undefined };
  } } as unknown as S3Client;
  assert.equal((await readInventory(client, 'fixture')).length, 2);
  assert.equal(calls[0].ContinuationToken, undefined);
  assert.equal(calls[1].ContinuationToken, 'second-page');
  assert.ok(calls.every(call => call.Bucket === 'fixture' && !('Key' in call)));
  const loop = { send: async () => ({ Contents: [], IsTruncated: true, NextContinuationToken: 'repeat' }) } as unknown as S3Client;
  await assert.rejects(readInventory(loop, 'fixture'), { code: 'InvalidPagination' });
});

test('Windows DPAPI key protection and whole backup verification work offline', { skip: process.platform !== 'win32' }, async () => {
  await fixture(async directory => {
    assert.deepEqual(await backupSource(source(), directory, dpapi), { verified: true, objects: 2, bytes: 4 });
    assert.deepEqual(await verifyBackup(directory, dpapi), { verified: true, objects: 2, bytes: 4 });
    const wrapped = await readFile(resolve(directory, 'key.dpapi'));
    assert.ok(wrapped.length > 32);
    wrapped[wrapped.length - 1] ^= 1;
    await writeFile(resolve(directory, 'key.dpapi'), wrapped);
    await assert.rejects(verifyBackup(directory, dpapi), { code: 'DpapiFailed' });
  });
});

test('R2 object reader sends IfMatch and handles HTTP timestamp precision while preserving exact bytes', async () => {
  const item = { ...entry('ready/private/audio', 4), modified: '2026-10-08T10:00:00.061Z' };
  let input: Record<string, unknown> | undefined;
  const client = { send: async (command: { input: Record<string, unknown> }) => {
    input = command.input;
    return { Body: Readable.from([Buffer.from('ab'), Buffer.from('cd')]), ContentLength: 4, ETag: item.etag, LastModified: new Date('2026-10-08T10:00:00.000Z'), Metadata: { owner: 'fixture' }, ContentType: 'audio/wav', ContentDisposition: 'inline', CacheControl: 'private' };
  } } as unknown as S3Client;
  const result = await readObject(client, 'fixture', item);
  assert.deepEqual(input, { Bucket: 'fixture', Key: item.key, IfMatch: item.etag });
  assert.equal(result.bytes.toString(), 'abcd');
  assert.deepEqual(result.metadata, { owner: 'fixture' });
  assert.equal(result.contentType, 'audio/wav');
  assert.equal(result.contentDisposition, 'inline');
  assert.equal(result.cacheControl, 'private');
});

test('R2 object reader rejects changed headers and incomplete/oversized response streams', async () => {
  const item = entry('audio', 4);
  for (const condition of ['etag', 'modified', 'length', 'short', 'long']) {
    const body = Readable.from([Buffer.alloc(condition === 'short' ? 3 : condition === 'long' ? 5 : 4)]);
    const client = { send: async () => ({ Body: body, ContentLength: condition === 'length' ? 5 : 4, ETag: condition === 'etag' ? 'changed' : item.etag, LastModified: new Date(condition === 'modified' ? '2026-10-09' : item.modified) }) } as unknown as S3Client;
    await assert.rejects(readObject(client, 'fixture', item), { code: ['short', 'long'].includes(condition) ? 'ObjectMismatch' : 'SourceChanged' });
    assert.equal(body.destroyed, true);
  }
});
