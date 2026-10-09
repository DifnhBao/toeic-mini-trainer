const canonical = 'https://toeic-mini-trainer.vercel.app';
const ownDeployment = /^https:\/\/toeic-mini-trainer-[a-z0-9]+-le-dinh-bao-s-projects\.vercel\.app$/;

export class WorkerProbeError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'WorkerProbeError';
    this.code = code;
    if (Number.isInteger(status)) this.status = status;
  }
}

async function readJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new WorkerProbeError('INVALID_RESPONSE');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) throw new WorkerProbeError('RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
    try {
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch { throw new WorkerProbeError('INVALID_RESPONSE'); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function probeWorker({ url, secret, mode = 'readiness-only', fetcher = fetch }) {
  if (!['readiness-only', 'drain'].includes(mode)) throw new WorkerProbeError('INVALID_MODE');
  let target;
  try { target = new URL(url); } catch { throw new WorkerProbeError('INVALID_TARGET'); }
  if ((target.origin !== canonical && !ownDeployment.test(target.origin)) || target.pathname !== '/api/internal/ingestions/drain'
    || target.username || target.password || target.search || target.hash)
    throw new WorkerProbeError('INVALID_TARGET');
  if (typeof secret !== 'string' || secret.length < 32 || /\s/.test(secret)) throw new WorkerProbeError('INVALID_CREDENTIAL');
  const headers = { Authorization: `Bearer ${secret}`, Accept: 'application/json' };
  async function request(endpoint, method, timeout) {
    try { return await fetcher(endpoint, { method, redirect: 'error', headers, signal: AbortSignal.timeout(timeout) }); }
    catch { throw new WorkerProbeError('TRANSPORT_FAILED'); }
  }
  const ready = await request(new URL('/api/internal/ready', target), 'GET', 20000);
  if (!ready.ok) throw new WorkerProbeError('READINESS_HTTP_FAILED', ready.status);
  if ((await readJson(ready))?.ready !== true) throw new WorkerProbeError('READINESS_NOT_READY');
  const rawId = ready.headers.get('x-request-id');
  const requestId = rawId && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(rawId) ? rawId : null;
  const receipt = { mode, canonicalTarget: target.origin === canonical, readinessStatus: ready.status, ready: true, requestId, workerCalled: false };
  // Manual checks stop here; never reach a job/counter mutation or provider call.
  if (mode === 'readiness-only') return receipt;
  const worker = await request(target, 'POST', 45000);
  if (!worker.ok) throw new WorkerProbeError('WORKER_HTTP_FAILED', worker.status);
  const data = await readJson(worker);
  if (typeof data?.queued !== 'boolean' || (data.paused !== undefined && typeof data.paused !== 'boolean') || (data.queued && data.paused))
    throw new WorkerProbeError('INVALID_WORKER_RESPONSE');
  return { ...receipt, workerCalled: true, workerStatus: worker.status, queued: data.queued, paused: data.paused === true };
}
