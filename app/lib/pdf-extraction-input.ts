import pdf from "pdf-parse/lib/pdf-parse.js";
import { PDFDocument } from "pdf-lib";
import { MAX_INGESTION_OCR_BYTES } from "@/app/lib/ingestion-limits";

// A text cover must not hide scanned question pages in the same selection.
export async function preparePdfExtraction(bytes: Uint8Array, pageStart: number) {
  const pageTexts: string[] = [];
  await pdf(Uint8Array.from(bytes) as unknown as Buffer, {
    pagerender: async (page) => {
      const content = await page.getTextContent();
      let lastY: number | undefined;
      let text = "";
      for (const item of content.items) {
        const y = item.transform[5];
        text += (lastY !== undefined && lastY !== y ? "\n" : " ") + item.str;
        lastY = y;
      }
      pageTexts.push(text.trim());
      return text;
    },
  });
  const source = await PDFDocument.load(bytes, { updateMetadata: false });
  // pdf-parse swallows individual page errors. Fail closed rather than omit a page.
  if (pageTexts.length !== source.getPageCount()) throw new Error("PDF_PAGE_TEXT_FAILED");
  const scanned = pageTexts.flatMap((text, index) => text.length < 20 ? [index] : []);
  let ocrBytes: Uint8Array | null = null;
  if (scanned.length) {
    if (bytes.byteLength <= MAX_INGESTION_OCR_BYTES) {
      ocrBytes = bytes;
    } else {
      // Keep text pages in the prompt; exclude a heavy text cover from the OCR PDF.
      const images = await PDFDocument.create();
      for (const page of await images.copyPages(source, scanned)) images.addPage(page);
      ocrBytes = await images.save();
    }
  }
  const ocrPageNumbers = ocrBytes === bytes
    ? pageTexts.map((_, index) => pageStart + index)
    : scanned.map(index => pageStart + index);
  return {
    rawText: pageTexts.map((text, index) => text ? `<page number="${pageStart + index}">\n${text}\n</page>` : "").filter(Boolean).join("\n"),
    ocrBytes,
    ocrPageNumbers,
    pageTextLengths: pageTexts.map(text => text.length),
  };
}
