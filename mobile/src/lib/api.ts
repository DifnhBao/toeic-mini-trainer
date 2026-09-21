const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

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
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
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
        error?.message || 'Máy chủ tạm thời không phản hồi.',
        response.status,
        error?.code,
      );
    }
    if (!payload) throw new ApiError('Phản hồi từ máy chủ không hợp lệ.', 502);
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
