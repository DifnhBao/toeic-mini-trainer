type PolledJob = { status: string; errorCode: string | null };

export function ingestionErrorMessage(code: string | null) {
  const messages: Record<string, string> = {
    DOCUMENT_PARSE_FAILED: 'PDF bị hỏng hoặc không thể đọc. Hãy thử xuất lại PDF.',
    DOCUMENT_TEXT_EMPTY: 'PDF không có lớp chữ. Hãy chạy lại sau khi cập nhật để AI đọc bản scan.',
    DOCUMENT_PAGE_RANGE_INVALID: 'Trang bắt đầu nằm ngoài PDF. Hãy chọn trang hợp lệ.',
    DOCUMENT_SECTION_TOO_LONG: 'Các trang đã chọn có quá nhiều chữ. Hãy phân tích ít trang hơn trên web.',
    DOCUMENT_OCR_TOO_LARGE: 'Bản scan quá nặng để đọc ảnh. Hãy nén PDF.',
    DOCUMENT_NO_QUESTIONS: 'Không tìm thấy câu hỏi trong các trang đã chọn. Hãy chọn trang khác.',
    AI_RATE_LIMITED: 'Dịch vụ AI đang giới hạn lượt gọi. Hãy thử lại sau.',
    AI_DAILY_LIMIT: 'Đã hết hạn mức phân tích AI hoặc tính năng đang tạm dừng. Hãy thử lại sau; không cần upload lại tài liệu.',
    AI_PROVIDER_UNAVAILABLE: 'Dịch vụ AI tạm thời không phản hồi. Hãy thử lại sau.',
    AI_RESPONSE_INVALID: 'AI chưa trả về câu hỏi đúng cấu trúc. Hãy thử tài liệu khác hoặc khoảng trang ngắn hơn.',
  };
  return messages[code || ''] || `Không thể phân tích tài liệu (${code || 'INGESTION_FAILED'}).`;
}

export function isTransientPollError(error: unknown) {
  return error instanceof TypeError ||
    (error instanceof Error && 'status' in error && typeof error.status === 'number' &&
      (error.status === 408 || error.status === 429 || error.status >= 500));
}

export async function pollIngestionJob<T extends PolledJob>({
  read,
  onJob,
  onTransientError,
  wait = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  timeoutMs = 5 * 60_000,
  signal,
}: {
  read: () => Promise<T>;
  onJob: (job: T) => void;
  onTransientError?: () => void;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  signal?: AbortSignal;
}) {
  const deadline = now() + timeoutMs;
  let consecutiveFailures = 0;
  while (now() < deadline) {
    if (signal?.aborted) throw new Error('Đã dừng theo dõi tác vụ.');
    try {
      const job = await read();
      if (signal?.aborted) throw new Error('Đã dừng theo dõi tác vụ.');
      consecutiveFailures = 0;
      onJob(job);
      if (job.status === 'COMPLETED' || job.status === 'IMPORTED') return job;
      if (job.status === 'FAILED') {
        throw new Error(ingestionErrorMessage(job.errorCode));
      }
    } catch (error) {
      if (signal?.aborted) throw new Error('Đã dừng theo dõi tác vụ.');
      if (!isTransientPollError(error)) throw error;
      consecutiveFailures += 1;
      onTransientError?.();
    }
    await wait(Math.min(2_000 * 2 ** Math.min(consecutiveFailures, 2), 8_000));
  }
  throw new Error('Chưa nhận được kết quả sau 5 phút. Hãy thử theo dõi lại khi có mạng.');
}
