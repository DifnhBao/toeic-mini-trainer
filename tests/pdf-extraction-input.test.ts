import assert from "node:assert/strict";
import { it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { preparePdfExtraction } from "../app/lib/pdf-extraction-input";
import { MAX_INGESTION_OCR_BYTES } from "../app/lib/ingestion-limits";

it("does not let a text cover suppress OCR of subsequent scanned pages", async () => {
  const source = await PDFDocument.create();
  source.addPage().drawText("All New ETS Preparation Test - ETS 2022 Release");
  source.addPage();
  const bytes = await source.save();
  const input = await preparePdfExtraction(bytes, 3);
  assert.deepEqual(input.pageTextLengths, [47, 0]);
  assert.ok(input.ocrBytes);
  assert.deepEqual(input.ocrPageNumbers, [3, 4]);
  assert.match(input.rawText, /number="3"/);
});

it("excludes an oversized text cover from OCR while retaining its text and original page numbers", async () => {
  const source = await PDFDocument.create();
  source.addPage().drawText("Text cover with more than twenty characters");
  source.addPage();
  // Uncompressed metadata simulates a heavy cover without private fixtures.
  source.setSubject("x".repeat(MAX_INGESTION_OCR_BYTES));
  const bytes = await source.save({ useObjectStreams: false });
  assert.ok(bytes.byteLength > MAX_INGESTION_OCR_BYTES);
  const input = await preparePdfExtraction(bytes, 7);
  assert.ok(input.ocrBytes && input.ocrBytes.byteLength < MAX_INGESTION_OCR_BYTES);
  assert.equal((await PDFDocument.load(input.ocrBytes)).getPageCount(), 1);
  assert.deepEqual(input.ocrPageNumbers, [8]);
  assert.match(input.rawText, /number="7"/);
});

it("uses text without OCR when every selected page has extractable content", async () => {
  const source = await PDFDocument.create();
  source.addPage().drawText("Question 1: The report is ready. A: yes B: no");
  const input = await preparePdfExtraction(await source.save(), 5);
  assert.equal(input.ocrBytes, null);
  assert.match(input.rawText, /Question 1/);
});
