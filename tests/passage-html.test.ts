import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizePassageHtml } from "../app/lib/passage-html";

describe("passage HTML", () => {
  it("preserves plain reading text and remains stable when imported again", () => {
    assert.equal(sanitizePassageHtml('Source passage'), 'Source passage');
    const safe = sanitizePassageHtml('Notice <h2>Meeting</h2><p>Friday &amp; Saturday</p>');
    assert.match(safe, /Notice Meeting/);
    assert.equal(sanitizePassageHtml(safe), safe);
  });

  it("removes embedded and executable element contents, not just their tags", () => {
    const safe = sanitizePassageHtml('Keep <iframe>hidden</iframe><svg><script>bad()</script></svg><style>body{}</style><p>Read</p>');
    assert.equal(safe, 'Keep <p>Read</p>');
  });
  it("keeps reading structure without trusting attributes", () => {
    const html = sanitizePassageHtml('<div class="x"><strong>To:</strong> Staff<br><p>Friday</p></div>');
    assert.match(html, /<strong>To:<\/strong>/);
    assert.match(html, /<br\s*\/?\s*>/);
    assert.match(html, /<p>Friday<\/p>/);
    assert.doesNotMatch(html, /class=/);
  });

  it("removes executable markup and dangerous URLs", () => {
    const html = sanitizePassageHtml(
      '<script>alert(1)</script><img src=x onerror=alert(2)>' +
      '<a href="javascript:alert(3)">Click</a><strong onclick="alert(4)">Safe</strong>',
    );
    assert.doesNotMatch(html, /<script|<img|<a|onerror|onclick|javascript:|alert\(/i);
    assert.match(html, /<strong>Safe<\/strong>/);
  });
});
