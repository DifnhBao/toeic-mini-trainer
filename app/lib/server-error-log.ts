// Error names can be controlled by SDK payloads or custom errors. Keep only
// known class labels; never serialize the Error, its stack/cause or metadata.
const ERROR_TYPES = new Set([
  "Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError",
  "AbortError", "TimeoutError", "ZodError", "S3ServiceException",
  "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError", "PrismaClientInitializationError",
  "PrismaClientValidationError", "PrismaClientRustPanicError",
  "ObjectStorageConfigurationError", "ObjectNotReadyError",
]);

export function safeErrorType(error: unknown): string {
  try {
    if (error instanceof Error) {
      const name = error.name;
      if (ERROR_TYPES.has(name)) return name;
    }
  } catch { /* Malformed error/proxy/getter must not break the API error handler. */ }
  return "UnknownError";
}

type ServerErrorEvent =
  | "upload.intent.failed"
  | "upload.read.failed"
  | "upload.complete.failed"
  | "upload.invalid_cleanup.failed"
  | "upload.staging_cleanup.failed"
  | "upload.local.failed"
  | "test.read.failed";

export function logServerError(event: ServerErrorEvent, error: unknown) {
  console.error(JSON.stringify({ event, timestamp: new Date().toISOString(), errorType: safeErrorType(error) }));
}
