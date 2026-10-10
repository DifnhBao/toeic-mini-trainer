import { normalizeRequestId, withSupportCode } from '../../../shared/response-diagnostics';

export class ApiError extends Error {
  public readonly requestId?: string;
  constructor(message: string, public readonly status: number, public readonly code?: string, requestId?: unknown) {
    super(withSupportCode(message, requestId));
    this.name = 'ApiError';
    this.requestId = normalizeRequestId(requestId);
  }
}
