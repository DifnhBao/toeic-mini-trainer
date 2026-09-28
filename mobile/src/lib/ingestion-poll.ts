type PolledJob = { status: string; errorCode: string | null };

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
}: {
  read: () => Promise<T>;
  onJob: (job: T) => void;
  onTransientError?: () => void;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}) {
  const deadline = now() + timeoutMs;
  let consecutiveFailures = 0;
  while (now() < deadline) {
    try {
      const job = await read();
      consecutiveFailures = 0;
      onJob(job);
      if (job.status === 'COMPLETED' || job.status === 'IMPORTED') return job;
      if (job.status === 'FAILED') {
        throw new Error(`Không thể phân tích tài liệu (${job.errorCode || 'INGESTION_FAILED'}).`);
      }
    } catch (error) {
      if (!isTransientPollError(error)) throw error;
      consecutiveFailures += 1;
      onTransientError?.();
    }
    await wait(Math.min(2_000 * 2 ** Math.min(consecutiveFailures, 2), 8_000));
  }
  throw new Error('Chưa nhận được kết quả sau 5 phút. Hãy thử theo dõi lại khi có mạng.');
}
