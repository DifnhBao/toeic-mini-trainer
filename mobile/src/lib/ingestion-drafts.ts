import type { ExtractedQuestionGroup } from '../types/learning';
import { isValidDraftEntries, type ReviewEntry } from './question-review';

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
export type ReviewDraft = { version: 1; sourceHash: string; entries: ReviewEntry[]; activeIndex: number; savedAt: string };
const MAX_DRAFT_BYTES = 1024 * 1024;

// No dependency on a browser-only TextEncoder in the native runtime.
function utf8Length(text: string) {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function draftNamespace(apiUrl: string, userId: string) {
  return `toeic-review-v1:${encodeURIComponent(apiUrl)}:${encodeURIComponent(userId)}`;
}

export function createDraftStore(storage: Storage) {
  const writes = new Map<string, Promise<void>>();
  function enqueue(key: string, action: () => Promise<void>) {
    const previous = writes.get(key) || Promise.resolve();
    const next = previous.catch(() => undefined).then(action);
    writes.set(key, next);
    void next.finally(() => { if (writes.get(key) === next) writes.delete(key); }).catch(() => undefined);
    return next;
  }
  return {
    async readActive(namespace: string) {
      const key = `${namespace}:active`;
      await writes.get(key)?.catch(() => undefined);
      const value = await storage.getItem(key);
      return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
    },
    writeActive(namespace: string, jobId: string | null) {
      const key = `${namespace}:active`;
      return enqueue(key, () => jobId ? storage.setItem(key, jobId) : storage.removeItem(key));
    },
    async read(namespace: string, jobId: string, sourceHash: string, groups: ExtractedQuestionGroup[]) {
      const key = `${namespace}:${jobId}`;
      await writes.get(key)?.catch(() => undefined);
      const raw = await storage.getItem(key);
      if (!raw) return { draft: null, discarded: false };
      try {
        if (utf8Length(raw) > MAX_DRAFT_BYTES) throw new Error();
        const draft = JSON.parse(raw) as ReviewDraft;
        if (draft.version !== 1 || draft.sourceHash !== sourceHash || !isValidDraftEntries(draft.entries, groups) ||
          !Number.isInteger(draft.activeIndex) || draft.activeIndex < 0 || draft.activeIndex >= draft.entries.length ||
          typeof draft.savedAt !== 'string') throw new Error();
        return { draft, discarded: false };
      } catch { return { draft: null, discarded: true }; }
    },
    write(namespace: string, jobId: string, draft: ReviewDraft) {
      const raw = JSON.stringify(draft);
      if (utf8Length(raw) > MAX_DRAFT_BYTES) return Promise.reject(new Error('Bản nháp quá lớn để lưu trên điện thoại.'));
      return enqueue(`${namespace}:${jobId}`, () => storage.setItem(`${namespace}:${jobId}`, raw));
    },
    remove(namespace: string, jobId: string) {
      return enqueue(`${namespace}:${jobId}`, () => storage.removeItem(`${namespace}:${jobId}`));
    },
  };
}
