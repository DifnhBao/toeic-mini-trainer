import { probeWorker, WorkerProbeError } from './lib/worker-probe.mjs';

try {
  const receipt = await probeWorker({ url: process.env.WORKER_URL, secret: process.env.WORKER_SECRET,
    mode: process.env.GITHUB_EVENT_NAME === 'schedule' ? 'drain' : process.env.WORKER_MODE || 'readiness-only' });
  console.log(JSON.stringify(receipt));
} catch (error) {
  // Never log a fetch/parser error containing the URL, header or raw response.
  console.error(JSON.stringify({ success: false, code: error instanceof WorkerProbeError ? error.code : 'CHECK_FAILED',
    ...(error instanceof WorkerProbeError && error.status ? { status: error.status } : {}) }));
  process.exitCode = 1;
}
