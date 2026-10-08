import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatCoachText } from '../mobile/src/lib/coach-text';
describe('native AI Coach formatting', () => {
  it('turns headings, emphasis and lists into readable native text', () => {
    assert.equal(formatCoachText('# Quy tắc\n\n**Hiện tại hoàn thành**\n- Dùng `have/has`\n- *Ví dụ*: I have worked.\n\n---\nGhi nhớ: kết quả.'),
      'Quy tắc\n\nHiện tại hoàn thành\n• Dùng have/has\n• Ví dụ: I have worked.\n\nGhi nhớ: kết quả.');
  });
  it('converts a Markdown table into labelled paragraphs without losing cells', () => {
    assert.equal(formatCoachText('| Thì | Ví dụ |\n| --- | --- |\n| Past | I worked. |\n| Present | I work. |\n\nGhi nhớ: thời gian.'),
      'Thì: Past\nVí dụ: I worked.\n\nThì: Present\nVí dụ: I work.\n\nGhi nhớ: thời gian.');
  });
  it('keeps ordinary text and code content; links become readable labels', () => {
    assert.equal(formatCoachText('2 * 3 = 6\n[Ví dụ](https://example.test)\n```text\nA_B\n```'), '2 * 3 = 6\nVí dụ\nA_B');
  });
});
