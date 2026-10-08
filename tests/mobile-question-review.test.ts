import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildReviewedImport, requiresQuestionReview } from '../app/lib/ingestion-review';
import { submitContributionSchema } from '../app/lib/content-contributions';
import { createDraftStore, draftNamespace, type ReviewDraft } from '../mobile/src/lib/ingestion-drafts';
import { assertReviewProtocol, buildReviewPayload, editEntry, initialEntries, validationMessage } from '../mobile/src/lib/question-review';
import { pollIngestionJob } from '../mobile/src/lib/ingestion-poll';
import type { ExtractedQuestionGroup } from '../mobile/src/types/learning';

const groups: ExtractedQuestionGroup[] = [{
  group: { groupType: 'TEXT', passageText: 'Source passage' },
  questions: [
    { part: 5, content: 'First', options: { A: 'one', B: 'two' }, correctAnswer: 'A' },
    { part: 5, content: 'Second', options: { A: 'yes', B: 'no' }, correctAnswer: 'A' },
  ],
}];
const jobId = '00000000-0000-4000-8000-000000000001';
const namespace = draftNamespace('https://api.example', 'owner');
function approvedDraft(): ReviewDraft {
  const entries = initialEntries(groups);
  entries[0] = { ...entries[0], decision: 'APPROVE', question: { ...entries[0].question, content: ' Edited ', options: { A: ' one ', B: ' two ', C: '' }, correctAnswer: 'B' } };
  entries[1].decision = 'SKIP';
  return { version: 1, sourceHash: 'test-hash', entries, activeIndex: 1, savedAt: '2026-10-01T00:00:00.000Z' };
}
function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: async (key: string) => values.get(key) || null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); } };
}

describe('mobile per-question review', () => {
  it('blocks writes against an older or rolled-back API instead of losing reviewed edits', () => {
    assert.throws(() => assertReviewProtocol({}), /cập nhật server/);
    assert.throws(() => assertReviewProtocol({ reviewProtocol: 0 }), /cập nhật server/);
    assert.doesNotThrow(() => assertReviewProtocol({ reviewProtocol: 1 }));
  });
  it('starts pending and cannot save before every decision or with all skipped', () => {
    const entries = initialEntries(groups);
    assert.ok(entries.every((entry) => entry.decision === 'PENDING'));
    assert.throws(() => buildReviewPayload(entries));
    entries.forEach((entry) => { entry.decision = 'SKIP'; });
    assert.throws(() => buildReviewPayload(entries));
  });
  it('sends corrected approved questions and skips through the real server validator', () => {
    const payload = buildReviewPayload(approvedDraft().entries);
    const result = buildReviewedImport({ data: groups }, payload);
    assert.equal(result.data[0].questions.length, 1);
    assert.equal(result.data[0].questions[0].content, 'Edited');
    assert.equal(result.data[0].questions[0].correctAnswer, 'B');
    assert.deepEqual(result.data[0].questions[0].options, { A: 'one', B: 'two' });
    assert.equal(result.data[0].group?.passageText, 'Source passage');
    assert.equal(submitContributionSchema.safeParse({ jobId, ...payload, rightsConfirmed: true }).success, true);
    assert.equal(submitContributionSchema.safeParse({ jobId, ...payload, rightsConfirmed: false }).success, false);
    assert.equal(submitContributionSchema.safeParse({ jobId, ...payload, data: { data: groups }, rightsConfirmed: true }).success, false);
  });
  it('editing any approved question requires a new decision without mutating the original', () => {
    const entries = approvedDraft().entries;
    const changed = editEntry(entries, 0, { ...entries[0].question, correctAnswer: 'A' });
    assert.equal(changed[0].decision, 'PENDING');
    assert.equal(entries[0].decision, 'APPROVE');
    assert.throws(() => buildReviewPayload(changed));
  });
  it('validates native edits using the same limits and optional listening content as the API', () => {
    const q = approvedDraft().entries[0].question;
    assert.match(validationMessage({ ...q, content: '' })!, /nội dung/);
    assert.equal(validationMessage({ ...q, part: 2, content: '' }), null);
    assert.ok(validationMessage({ ...q, options: { A: 'only' } }));
    assert.ok(validationMessage({ ...q, correctAnswer: 'D' }));
    assert.ok(validationMessage({ ...q, content: 'x'.repeat(10001) }));
    assert.ok(validationMessage({ ...q, options: { A: 'x'.repeat(4001), B: 'ok' } }));
  });
  it('only permits bodyless Bearer compatibility; supplied malformed bodies still require validation', () => {
    assert.equal(requiresQuestionReview(new Request('https://api.example', { method: 'POST', headers: { authorization: 'Bearer old-apk' } })), false);
    for (const body of ['{}', 'broken', '']) {
      assert.equal(requiresQuestionReview(new Request('https://api.example', { method: 'POST', headers: { authorization: 'Bearer new-apk' }, body })), true);
    }
    assert.equal(requiresQuestionReview(new Request('https://api.example', { method: 'POST' })), true);
  });
});

describe('persistent mobile review drafts', () => {
  it('restores edits, decisions, selected question and active task after store recreation', async () => {
    const storage = memoryStorage();
    await createDraftStore(storage).write(namespace, jobId, approvedDraft());
    await createDraftStore(storage).writeActive(namespace, jobId);
    const recreated = createDraftStore(storage);
    assert.deepEqual((await recreated.read(namespace, jobId, 'test-hash', groups)).draft, approvedDraft());
    assert.equal(await recreated.readActive(namespace), jobId);
  });
  it('isolates different accounts, API environments and jobs', async () => {
    const store = createDraftStore(memoryStorage());
    await store.write(namespace, jobId, approvedDraft());
    await store.writeActive(namespace, jobId);
    assert.equal((await store.read(draftNamespace('https://api.example', 'another-user'), jobId, 'test-hash', groups)).draft, null);
    assert.equal((await store.read(draftNamespace('http://localhost:3000', 'owner'), jobId, 'test-hash', groups)).draft, null);
    assert.equal((await store.read(namespace, 'another-job', 'test-hash', groups)).draft, null);
    assert.equal(await store.readActive(draftNamespace('https://api.example', 'another-user')), null);
  });
  it('rejects a stale AI result or corrupt/mislocated/invalid approved draft', async () => {
    const storage = memoryStorage(); const store = createDraftStore(storage);
    await store.write(namespace, jobId, approvedDraft());
    assert.equal((await store.read(namespace, jobId, 'changed-result', groups)).discarded, true);
    for (const corrupt of [
      '{bad json', 'null',
      JSON.stringify({ ...approvedDraft(), activeIndex: 999 }),
      JSON.stringify({ ...approvedDraft(), entries: approvedDraft().entries.map((entry) => ({ ...entry, groupIndex: 99 })) }),
      JSON.stringify({ ...approvedDraft(), entries: approvedDraft().entries.map((entry) => ({ ...entry, question: { ...entry.question, correctAnswer: 'D' } })) }),
    ]) {
      storage.values.set(`${namespace}:${jobId}`, corrupt);
      assert.deepEqual(await store.read(namespace, jobId, 'test-hash', groups), { draft: null, discarded: true });
    }
  });
  it('serializes writes so a slow older edit never replaces the latest edit', async () => {
    const storage = memoryStorage(); let release!: () => void; let writes = 0;
    const store = createDraftStore({ ...storage, setItem: async (key, value) => {
      writes += 1;
      if (writes === 1) await new Promise<void>((resolve) => { release = resolve; });
      await storage.setItem(key, value);
    } });
    const old = store.write(namespace, jobId, approvedDraft());
    const newest = { ...approvedDraft(), activeIndex: 0 };
    const next = store.write(namespace, jobId, newest);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(writes, 1);
    release(); await Promise.all([old, next]);
    assert.deepEqual((await store.read(namespace, jobId, 'test-hash', groups)).draft, newest);
  });
  it('surfaces a storage failure, then permits retry; never stores rights, tokens or media URLs', async () => {
    const storage = memoryStorage(); let fail = true;
    const store = createDraftStore({ ...storage, setItem: async (key, value) => {
      if (fail) throw new Error('storage full'); await storage.setItem(key, value);
    } });
    await assert.rejects(store.write(namespace, jobId, approvedDraft()), /storage full/);
    fail = false; await store.write(namespace, jobId, approvedDraft());
    const raw = storage.values.get(`${namespace}:${jobId}`)!;
    assert.doesNotMatch(raw, /rightsConfirmed|accessToken|refreshToken|audioUrl|documentUrl/);
    await store.remove(namespace, jobId);
    assert.equal((await store.read(namespace, jobId, 'test-hash', groups)).draft, null);
  });
  it('caps oversized local drafts before attempting a write', async () => {
    const storage = memoryStorage(); const draft = approvedDraft();
    draft.entries[0].question.content = 'ế'.repeat(400000);
    await assert.rejects(createDraftStore(storage).write(namespace, jobId, draft), /quá lớn/);
    assert.equal(storage.values.size, 0);
  });
  it('discards a late poll response after logout before it can update the screen', async () => {
    const controller = new AbortController(); let updates = 0;
    await assert.rejects(pollIngestionJob({
      signal: controller.signal,
      read: async () => { controller.abort(); return { status: 'COMPLETED', errorCode: null }; },
      onJob: () => { updates += 1; },
    }), /Đã dừng/);
    assert.equal(updates, 0);
  });
});
