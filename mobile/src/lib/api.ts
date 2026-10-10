import { ApiError } from './api-error';
import { REQUEST_ID_HEADER } from '../../../shared/response-diagnostics';
export { ApiError } from './api-error';

const REQUEST_TIMEOUT_MS = 15_000;

export function getApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!configured) throw new Error('Thiếu EXPO_PUBLIC_API_URL trong cấu hình mobile.');

  const url = new URL(configured);
  if (!__DEV__ && url.protocol !== 'https:') {
    throw new Error('API production bắt buộc sử dụng HTTPS.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('EXPO_PUBLIC_API_URL không hợp lệ.');
  }
  return url.toString().replace(/\/$/, '');
}

export async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = new Headers({
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    });
    // Headers instances have platform-specific internals. Object spreading
    // them sends those internals to Expo's native bridge instead of HTTP headers.
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    const headerPairs: [string, string][] = [];
    headers.forEach((value, name) => headerPairs.push([name, value]));

    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: headerPairs,
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | T
      | null;

    if (!response.ok) {
      const error =
        typeof payload === 'object' && payload !== null && 'error' in payload
          ? payload.error
          : undefined;
      throw new ApiError(
        typeof error?.message === 'string' && error.message.trim() ? error.message : 'Máy chủ tạm thời không phản hồi.',
        response.status,
        typeof error?.code === 'string' ? error.code : undefined,
        response.headers.get(REQUEST_ID_HEADER),
      );
    }
    if (!payload) throw new ApiError('Phản hồi từ máy chủ không hợp lệ.', 502, undefined, response.headers.get(REQUEST_ID_HEADER));
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Kết nối quá thời gian. Vui lòng thử lại.', 408);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
