import type { TestData } from '../types/learning';
import { restorePracticeDraft, type createPracticeDraftStore, type PracticeDraft } from './practice-drafts';

type LegacyStorage = { getAllKeys(): Promise<readonly string[]>; getItem(key: string): Promise<string | null>; removeItem(key: string): Promise<void> };
export async function recoverLegacyPracticeDrafts(options: {
  namespace: string; storage: LegacyStorage; drafts: ReturnType<typeof createPracticeDraftStore>;
  fetchOwnedTest: (testId: string) => Promise<TestData | null>; newId: () => string;
  expectedUserId: string;
}) {
  const keys = (await options.storage.getAllKeys()).filter((key) => /^toeic\.draft\.[0-9a-f-]{36}$/i.test(key)).slice(0, 20);
  for (const key of keys) {
    const testId = key.slice('toeic.draft.'.length);
    // Old keys did not identify their account. Never expose or adopt them
    // until the current server authorizes this user to read that exact test.
    const test = await options.fetchOwnedTest(testId);
    if (!test || test.ownerId !== options.expectedUserId) continue;
    if (!(await options.drafts.read(options.namespace, testId))) {
      const raw = await options.storage.getItem(key);
      if (!raw || raw.length > 100_000) continue;
      let legacy: Partial<PracticeDraft>;
      try { legacy = JSON.parse(raw); } catch { continue; }
      const draft = restorePracticeDraft({ ...legacy, testId, title: test.title, total: test.questions.length, updatedAt: Date.now() } as PracticeDraft, test, options.newId);
      await options.drafts.save(options.namespace, draft);
    }
    await options.storage.removeItem(key);
  }
}
