import { normalizeRequestId, REQUEST_ID_HEADER } from '@/shared/response-diagnostics';
export { normalizeRequestId, REQUEST_ID_HEADER } from '@/shared/response-diagnostics';

export function requestIdFields(value: unknown): { requestId?: string } {
  const requestId = normalizeRequestId(value);
  return requestId ? { requestId } : {};
}

export function requestLogFields(request?: Pick<Request, "headers">): { requestId?: string } {
  return requestIdFields(request?.headers.get(REQUEST_ID_HEADER));
}
