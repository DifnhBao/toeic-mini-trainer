declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfResult = {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  };

  type PdfPage = {
    getTextContent(): Promise<{ items: Array<{ str: string; transform: number[] }> }>;
  };
  function pdfParse(dataBuffer: Buffer, options?: { pagerender?: (page: PdfPage) => Promise<string> }): Promise<PdfResult>;
  export default pdfParse;
}
