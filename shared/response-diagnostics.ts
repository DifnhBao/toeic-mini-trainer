export const REQUEST_ID_HEADER = 'x-request-id';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function normalizeRequestId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length === 36 && UUID_V4.test(value) ? value : undefined;
}

export function withSupportCode(message: string, value: unknown): string {
  const requestId = normalizeRequestId(value);
  return requestId ? `${message}\nMã hỗ trợ: ${requestId}` : message;
}

// Only read the response's server-issued ID. Caller IDs, body fields, URLs,
// cookies and provider metadata are not support codes.
export function apiFailureMessage(response: Pick<Response, 'headers'>, payload: unknown, fallback: string): string {
  const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
  const candidate = typeof error === 'string' ? error : error && typeof error === 'object' && 'message' in error ? error.message : undefined;
  const message = typeof candidate === 'string' && candidate.trim() ? candidate : fallback;
  return withSupportCode(message, response.headers.get(REQUEST_ID_HEADER));
}
