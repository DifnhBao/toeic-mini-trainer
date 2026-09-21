declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfResult = {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  };

  function pdfParse(dataBuffer: Buffer): Promise<PdfResult>;
  export default pdfParse;
}
