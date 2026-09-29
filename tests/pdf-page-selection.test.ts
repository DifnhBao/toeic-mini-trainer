import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { PdfPageSelectionError, selectPdfPages } from "../app/lib/pdf-page-selection";

async function samplePdf(pageCount: number) {
  const document = await PDFDocument.create();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    document.addPage().drawText(`QUESTION PAGE ${pageNumber}`);
  }
  return document.save();
}

describe("PDF page selection", () => {
  it("selects only requested pages without silently truncating later pages", async () => {
    const selected = await selectPdfPages(await samplePdf(8), 5, 8);
    const text = (await pdf(Uint8Array.from(selected.bytes) as unknown as Buffer)).text;
    assert.equal(selected.totalPages, 8);
    assert.equal(selected.pageStart, 5);
    assert.equal(selected.pageEnd, 8);
    assert.match(text, /QUESTION PAGE 5/);
    assert.match(text, /QUESTION PAGE 8/);
    assert.doesNotMatch(text, /QUESTION PAGE 4/);
  });

  it("defaults to at most four pages and clamps the final section", async () => {
    const selected = await selectPdfPages(await samplePdf(6), 5);
    assert.equal(selected.pageEnd, 6);
    assert.equal((await PDFDocument.load(selected.bytes)).getPageCount(), 2);
  });

  it("rejects out-of-bounds or overlong ranges before contacting AI", async () => {
    const bytes = await samplePdf(6);
    await assert.rejects(selectPdfPages(bytes, 7), (error: unknown) =>
      error instanceof PdfPageSelectionError && error.code === "DOCUMENT_PAGE_RANGE_INVALID");
    await assert.rejects(selectPdfPages(bytes, 1, 5), (error: unknown) =>
      error instanceof PdfPageSelectionError && error.code === "DOCUMENT_PAGE_RANGE_INVALID");
  });
});
