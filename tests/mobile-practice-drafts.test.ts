import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { createPracticeDraftStore, practiceNamespace, restorePracticeDraft, type PracticeDraft } from '../mobile/src/lib/practice-drafts';
import type { TestData } from '../mobile/src/types/learning';
import { recoverLegacyPracticeDrafts } from '../mobile/src/lib/legacy-practice-drafts';
const namespace = practiceNamespace('https://api.test', 'user-a');
const questionId = randomUUID(); const testId = randomUUID();
const test: TestData = { id: testId, ownerId: 'user-a', title: 'Test', createdAt: new Date().toISOString(), questions: [
  { orderIndex: 1, question: { id: questionId, part: 2, content: 'Question', options: { A: 'one', B: 'two', C: 'three' }, group: null } },
] };
const draft = (): PracticeDraft => ({ testId, title: 'Test', total: 1, updatedAt: 2000, startedAt: 1000,
  currentIndex: 0, clientSubmissionId: randomUUID(), answers: { [questionId]: 'C' } });
function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { await new Promise((resolve) => setTimeout(resolve, 1)); values.set(key, value); } };
}
describe('discoverable mobile practice drafts', () => {
  it('survives a new store instance with answers, position, elapsed origin and submission identity intact', async () => {
    const storage = memoryStorage(); const original = draft();
    await createPracticeDraftStore(storage).save(namespace, original);
    const restarted = createPracticeDraftStore(storage);
    assert.equal((await restarted.list(namespace))[0].testId, testId);
    const restored = restorePracticeDraft(await restarted.read(namespace, testId), test, randomUUID, 3000);
    assert.deepEqual(restored.answers, original.answers);
    assert.equal(restored.currentIndex, 0); assert.equal(restored.startedAt, 1000);
    assert.equal(restored.clientSubmissionId, original.clientSubmissionId);
  });
  it('keeps accounts and API environments separate', async () => {
    const store = createPracticeDraftStore(memoryStorage()); await store.save(namespace, draft());
    assert.deepEqual(await store.list(practiceNamespace('https://api.test', 'user-b')), []);
    assert.deepEqual(await store.list(practiceNamespace('https://staging.test', 'user-a')), []);
  });
  it('serializes rapid edits and prevents a late save from resurrecting a submitted test', async () => {
    const store = createPracticeDraftStore(memoryStorage()); const original = draft();
    await Promise.all([store.save(namespace, original), store.save(namespace, { ...original, answers: { [questionId]: 'A' } })]);
    assert.equal((await store.read(namespace, testId))?.answers[questionId], 'A');
    await Promise.all([store.save(namespace, original), store.remove(namespace, testId), store.save(namespace, original)]);
    assert.deepEqual(await store.list(namespace), []);
  });
  it('does not lose another unfinished test when one is completed', async () => {
    const store = createPracticeDraftStore(memoryStorage()); const second = { ...draft(), testId: randomUUID() };
    await Promise.all([store.save(namespace, draft()), store.save(namespace, second)]);
    await store.remove(namespace, testId);
    assert.deepEqual((await store.list(namespace)).map((value) => value.testId), [second.testId]);
  });
  it('drops foreign question IDs and invalid Part 2 choices before restoring', () => {
    const original = draft(); original.answers[questionId] = 'D'; original.answers[randomUUID()] = 'A';
    assert.deepEqual(restorePracticeDraft(original, test, randomUUID, 3000).answers, {});
    assert.notEqual(restorePracticeDraft({ ...original, testId: randomUUID() }, test, randomUUID).clientSubmissionId, original.clientSubmissionId);
  });
  it('recovers from corrupt storage and surfaces storage failures instead of claiming a save', async () => {
    const storage = memoryStorage(); storage.values.set(namespace, '{broken');
    const store = createPracticeDraftStore(storage); assert.deepEqual(await store.list(namespace), []);
    await store.save(namespace, draft()); assert.equal((await store.list(namespace)).length, 1);
    const failing = createPracticeDraftStore({ getItem: storage.getItem, setItem: async () => { throw new Error('storage full'); } });
    await assert.rejects(failing.save(namespace, draft()), /storage full/);
  });
  it('recovers an old unindexed draft only after server ownership authorization', async () => {
    const storage = memoryStorage(); const store = createPracticeDraftStore(storage); const original = draft();
    const legacyKey = `toeic.draft.${testId}`;
    storage.values.set(legacyKey, JSON.stringify(original));
    const legacyStorage = { ...storage, getAllKeys: async () => [...storage.values.keys()], removeItem: async (key: string) => { storage.values.delete(key); } };
    const options = { namespace, storage: legacyStorage, drafts: store, newId: randomUUID, expectedUserId: 'user-a' };
    await recoverLegacyPracticeDrafts({ ...options, fetchOwnedTest: async () => null });
    assert.deepEqual(await store.list(namespace), []); assert.ok(storage.values.has(legacyKey));
    await recoverLegacyPracticeDrafts({ ...options, fetchOwnedTest: async () => ({ ...test, ownerId: 'user-b' }) });
    assert.deepEqual(await store.list(namespace), []); assert.ok(storage.values.has(legacyKey));
    await recoverLegacyPracticeDrafts({ ...options, fetchOwnedTest: async () => test });
    assert.equal((await store.read(namespace, testId))?.clientSubmissionId, original.clientSubmissionId);
    assert.deepEqual((await store.read(namespace, testId))?.answers, original.answers);
    assert.equal(storage.values.has(legacyKey), false);
  });
  it('does not overwrite newer work while recovering an older draft', async () => {
    const storage = memoryStorage(); const store = createPracticeDraftStore(storage); const original = draft();
    const legacyKey = `toeic.draft.${testId}`; storage.values.set(legacyKey, JSON.stringify(original));
    const current = { ...original, answers: { [questionId]: 'A' }, updatedAt: 4000 };
    await store.save(namespace, current);
    await recoverLegacyPracticeDrafts({ namespace, drafts: store, newId: randomUUID, fetchOwnedTest: async () => test, expectedUserId: 'user-a',
      storage: { ...storage, getAllKeys: async () => [...storage.values.keys()], removeItem: async (key) => { storage.values.delete(key); } },
    });
    assert.equal((await store.read(namespace, testId))?.answers[questionId], 'A');
  });
});
