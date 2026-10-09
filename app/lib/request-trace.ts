export const REQUEST_ID_HEADER = "x-request-id";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function normalizeRequestId(value: unknown): string | undefined {
  return typeof value === "string" && value.length === 36 && UUID_V4.test(value) ? value : undefined;
}

export function requestIdFields(value: unknown): { requestId?: string } {
  const requestId = normalizeRequestId(value);
  return requestId ? { requestId } : {};
}

export function requestLogFields(request?: Pick<Request, "headers">): { requestId?: string } {
  return requestIdFields(request?.headers.get(REQUEST_ID_HEADER));
}
