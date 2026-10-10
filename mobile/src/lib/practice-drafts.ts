import type { TestData } from '../types/learning';

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
export type PracticeDraft = {
  testId: string; title: string; total: number; updatedAt: number;
  answers: Record<string, string>; currentIndex: number; startedAt: number; clientSubmissionId: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function practiceNamespace(apiUrl: string, userId: string) {
  return `toeic.practice.v1:${encodeURIComponent(apiUrl)}:${encodeURIComponent(userId)}`;
}
function isDraft(value: unknown): value is PracticeDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as PracticeDraft;
  return typeof draft.testId === 'string' && UUID.test(draft.testId)
    && typeof draft.title === 'string' && draft.title.length <= 300
    && Number.isInteger(draft.total) && draft.total > 0 && draft.total <= 50
    && Number.isFinite(draft.updatedAt) && Number.isFinite(draft.startedAt) && draft.startedAt > 0
    && typeof draft.clientSubmissionId === 'string' && UUID.test(draft.clientSubmissionId)
    && Number.isInteger(draft.currentIndex) && draft.currentIndex >= 0 && draft.currentIndex < draft.total
    && !!draft.answers && typeof draft.answers === 'object' && !Array.isArray(draft.answers)
    && Object.entries(draft.answers).length <= 50
    && Object.entries(draft.answers).every(([id, answer]) => UUID.test(id) && typeof answer === 'string' && /^[ABCD]$/.test(answer));
}
export function restorePracticeDraft(saved: PracticeDraft | null, test: TestData, newId: () => string, now = Date.now()): PracticeDraft {
  const valid = saved && isDraft(saved) && saved.testId === test.id;
  const answers: Record<string, string> = {};
  if (valid) for (const { question } of test.questions) {
    const selected = saved.answers[question.id];
    if (selected && Object.hasOwn(question.options, selected)) answers[question.id] = selected;
  }
  return {
    testId: test.id, title: test.title.slice(0, 300), total: test.questions.length, updatedAt: now, answers,
    currentIndex: valid ? Math.min(saved.currentIndex, Math.max(0, test.questions.length - 1)) : 0,
    startedAt: valid ? Math.min(saved.startedAt, now) : now,
    clientSubmissionId: valid ? saved.clientSubmissionId : newId(),
  };
}

// One account-scoped record makes the draft and its discoverable list atomic.
// Serialize read-modify-write operations so a late save cannot undo deletion.
export function createPracticeDraftStore(storage: Storage) {
  const pending = new Map<string, Promise<unknown>>();
  const submitted = new Set<string>();
  function enqueue<T>(namespace: string, action: () => Promise<T>): Promise<T> {
    const next = (pending.get(namespace) ?? Promise.resolve()).catch(() => undefined).then(action);
    pending.set(namespace, next);
    void next.finally(() => { if (pending.get(namespace) === next) pending.delete(namespace); }).catch(() => undefined);
    return next;
  }
  async function load(namespace: string): Promise<PracticeDraft[]> {
    const raw = await storage.getItem(namespace);
    if (!raw) return [];
    try {
      if (raw.length > 200_000) throw new Error();
      const value = JSON.parse(raw);
      if (value.version !== 1 || !Array.isArray(value.drafts)) return [];
      return value.drafts.filter(isDraft).slice(0, 20);
    } catch { return []; }
  }
  return {
    list(namespace: string) { return enqueue(namespace, async () => (await load(namespace)).sort((a, b) => b.updatedAt - a.updatedAt)); },
    read(namespace: string, testId: string) { return enqueue(namespace, async () => (await load(namespace)).find((draft) => draft.testId === testId) ?? null); },
    save(namespace: string, draft: PracticeDraft) {
      return enqueue(namespace, async () => {
        if (submitted.has(`${namespace}:${draft.testId}`)) return;
        if (!isDraft(draft)) throw new Error('Không thể lưu bản nháp bài luyện.');
        const drafts = (await load(namespace)).filter((value) => value.testId !== draft.testId);
        if (drafts.length >= 20) throw new Error('Bạn có 20 bài đang luyện. Hãy hoàn thành hoặc xóa một bản nháp.');
        await storage.setItem(namespace, JSON.stringify({ version: 1, drafts: [draft, ...drafts] }));
      });
    },
    remove(namespace: string, testId: string) {
      submitted.add(`${namespace}:${testId}`);
      return enqueue(namespace, async () => {
        const drafts = (await load(namespace)).filter((draft) => draft.testId !== testId);
        await storage.setItem(namespace, JSON.stringify({ version: 1, drafts }));
      });
    },
  };
}
