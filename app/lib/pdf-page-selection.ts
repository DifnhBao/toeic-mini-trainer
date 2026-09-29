import { PDFDocument } from "pdf-lib";
import { MAX_INGESTION_PAGES } from "@/app/lib/ingestion-limits";

export class PdfPageSelectionError extends Error {
  constructor(public readonly code: "DOCUMENT_PARSE_FAILED" | "DOCUMENT_PAGE_RANGE_INVALID") {
    super(code);
    this.name = "PdfPageSelectionError";
  }
}

export async function selectPdfPages(
  sourceBytes: Uint8Array,
  pageStart = 1,
  requestedPageEnd: number | null = null,
) {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(sourceBytes, { updateMetadata: false });
  } catch {
    throw new PdfPageSelectionError("DOCUMENT_PARSE_FAILED");
  }

  const totalPages = source.getPageCount();
  const pageEnd = requestedPageEnd ?? Math.min(totalPages, pageStart + MAX_INGESTION_PAGES - 1);
  if (
    !Number.isSafeInteger(pageStart) || !Number.isSafeInteger(pageEnd) ||
    pageStart < 1 || pageEnd < pageStart || pageEnd > totalPages ||
    pageEnd - pageStart + 1 > MAX_INGESTION_PAGES
  ) {
    throw new PdfPageSelectionError("DOCUMENT_PAGE_RANGE_INVALID");
  }

  const selected = await PDFDocument.create();
  const pageNumbers = Array.from({ length: pageEnd - pageStart + 1 }, (_, index) => pageStart - 1 + index);
  const pages = await selected.copyPages(source, pageNumbers);
  for (const page of pages) selected.addPage(page);
  return { bytes: await selected.save(), totalPages, pageStart, pageEnd };
}
