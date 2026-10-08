import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it, mock } from 'node:test';
import { SignJWT } from 'jose';
import { initialEntries, buildReviewPayload } from '../mobile/src/lib/question-review';
import type { Prisma, PrismaClient } from '@prisma/client';

const jobId = '00000000-0000-4000-8000-000000000001';
const groups = [{ questions: [
  { part: 5, content: 'Original first', options: { A: 'yes', B: 'no' }, correctAnswer: 'A' },
  { part: 5, content: 'Original second', options: { A: 'yes', B: 'no' }, correctAnswer: 'A' },
] }];
const secret = 'unit-test-only-mobile-secret-at-least-32-characters';
let importRoute: typeof import('../app/api/v1/ingestions/[id]/import/route');
let listRoute: typeof import('../app/api/v1/ingestions/route');
let contributionRoute: typeof import('../app/api/v1/contributions/route');
let prisma: PrismaClient;
let contentWriters: Array<(request: Request) => Promise<Response>>;
const priorSecret = process.env.MOBILE_JWT_SECRET;
const priorGemini = process.env.GEMINI_API_KEY;

before(async () => {
  // Dummy credentials; all database calls below are mocked. No provider requests.
  process.env.MOBILE_JWT_SECRET = secret;
  process.env.GEMINI_API_KEY = 'unit-test-key-never-used';
  // Prisma delegates are proxies, not ordinary methods. Replace the entire
  // client BEFORE module loading so even an unexpected call cannot use Neon.
  const unexpected = async () => { throw new Error('Unexpected database call in unit test'); };
  const fake = {
    user: { findUnique: unexpected },
    ingestionJob: { findFirst: unexpected, updateMany: unexpected, findMany: unexpected },
    contentContribution: { findUnique: unexpected, create: unexpected },
    $transaction: unexpected,
  } as unknown as PrismaClient;
  (global as unknown as { prisma: PrismaClient }).prisma = fake;
  prisma = (await import('../app/lib/prisma')).prisma;
  importRoute = await import('../app/api/v1/ingestions/[id]/import/route');
  listRoute = await import('../app/api/v1/ingestions/route');
  contributionRoute = await import('../app/api/v1/contributions/route');
  const upload = await import('../app/api/v1/uploads/route');
  const complete = await import('../app/api/v1/uploads/[id]/complete/route');
  const retry = await import('../app/api/v1/ingestions/[id]/retry/route');
  const jsonImport = await import('../app/api/import/questions-json/route');
  const invalidId = { params: Promise.resolve({ id: 'invalid' }) };
  contentWriters = [(req) => upload.POST(req), (req) => complete.POST(req, invalidId),
    (req) => listRoute.POST(req), (req) => retry.POST(req, invalidId), (req) => contributionRoute.POST(req), (req) => jsonImport.POST(req)];
});

describe('admin-prepared content policy at the real API entry points', () => {
  for (const role of ['USER', 'REVIEWER'] as const) {
    it(`rejects ${role} before upload, storage, quota or worker access`, async () => {
      fakeDatabase();
      mock.method(prisma.user, 'findUnique', async () => ({ id: 'owner', role, status: 'ACTIVE' }));
      for (const write of contentWriters) {
        const response = await write(await request('{}'));
        assert.equal(response.status, 403);
        assert.equal((await response.json()).error.code, 'ADMIN_CONTENT_ONLY');
      }
    });
  }
  it('rejects suspended admins and invalid access tokens', async () => {
    fakeDatabase();
    mock.method(prisma.user, 'findUnique', async () => ({ id: 'owner', role: 'ADMIN', status: 'SUSPENDED' }));
    for (const write of contentWriters) {
      assert.equal((await write(await request('{}'))).status, 401);
      assert.equal((await write(new Request('https://api.example', { method: 'POST', headers: { authorization: 'Bearer invalid' } }))).status, 401);
    }
  });
  it('lets an active admin reach validation without calling storage or AI', async () => {
    fakeDatabase();
    for (const write of contentWriters) assert.equal((await write(await request('{}', 'policy-admin'))).status, 400);
  });
});
afterEach(() => mock.restoreAll());
after(() => {
  if (priorSecret === undefined) delete process.env.MOBILE_JWT_SECRET; else process.env.MOBILE_JWT_SECRET = priorSecret;
  if (priorGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = priorGemini;
});

async function request(body?: string, userId = 'owner') {
  const token = await new SignJWT({ tokenUse: 'access' }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId).setIssuer('toeic-mini-trainer').setAudience('toeic-mobile').setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret));
  return new Request('https://api.example/api/v1/ingestions/' + jobId + '/import', {
    method: 'POST', body, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
}

function fakeDatabase(source: unknown = { data: groups }, audioAssetId: string | null = null) {
  let status = 'COMPLETED'; let importedAt: Date | null = null; let claimed = 0;
  const saved: Array<Prisma.QuestionUncheckedCreateInput> = [];
  mock.method(prisma.user, 'findUnique', async ({ where }: { where: { id: string } }) => ({ id: where.id, role: 'ADMIN', status: 'ACTIVE' }));
  mock.method(prisma.ingestionJob, 'findFirst', async ({ where }: { where: { id: string; ownerId: string } }) =>
    where.ownerId === 'owner' && where.id === jobId ? { id: jobId, audioAssetId, result: source, status, importedAt } : null);
  mock.method(prisma.ingestionJob, 'updateMany', async ({ where }: { where: { ownerId: string } }) => {
    claimed += 1;
    if (where.ownerId !== 'owner' || status !== 'COMPLETED') return { count: 0 };
    status = 'IMPORTING'; return { count: 1 };
  });
  mock.method(prisma, '$transaction', async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => callback({
    question: { create: async ({ data }: { data: Prisma.QuestionUncheckedCreateInput }) => { saved.push(data); return { id: 'created' }; } },
    ingestionJob: { update: async ({ data }: { data: { status: string; importedAt: Date } }) => { status = data.status; importedAt = data.importedAt; } },
  } as unknown as Prisma.TransactionClient));
  return { saved, claims: () => claimed };
}

describe('real mobile import route with mocked database', () => {
  it('persists approved corrected content, excludes skipped questions, and is idempotent', async () => {
    const db = fakeDatabase(); const entries = initialEntries(groups);
    entries[0] = { ...entries[0], decision: 'APPROVE', question: { ...entries[0].question, content: 'Edited first', correctAnswer: 'B' } };
    entries[1].decision = 'SKIP';
    const payload = JSON.stringify(buildReviewPayload(entries));
    const response = await importRoute.POST(await request(payload), { params: Promise.resolve({ id: jobId }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).questionsAdded, 1);
    assert.equal(db.saved.length, 1);
    assert.equal(db.saved[0].content, 'Edited first');
    assert.equal(db.saved[0].correctAnswer, 'B');
    assert.equal(db.saved[0].ownerId, 'owner');
    assert.equal(db.saved[0].publicationStatus, 'PRIVATE');
    const duplicate = await importRoute.POST(await request(payload), { params: Promise.resolve({ id: jobId }) });
    assert.equal((await duplicate.json()).alreadyImported, true);
    assert.equal(db.saved.length, 1);
  });
  it('rejects malformed, partial and oversized supplied Bearer payloads before claiming', async () => {
    const db = fakeDatabase();
    for (const payload of ['broken', '{}', JSON.stringify({ reviews: [{ groupIndex: 0, questionIndex: 0, decision: 'SKIP' }] })]) {
      const response = await importRoute.POST(await request(payload), { params: Promise.resolve({ id: jobId }) });
      assert.equal(response.status, 400);
    }
    const oversized = await importRoute.POST(await request('x'.repeat(512 * 1024 + 1)), { params: Promise.resolve({ id: jobId }) });
    assert.equal(oversized.status, 413);
    assert.equal(db.claims(), 0);
    assert.equal(db.saved.length, 0);
  });
  it('preserves installed bodyless APK compatibility', async () => {
    const db = fakeDatabase();
    const response = await importRoute.POST(await request(), { params: Promise.resolve({ id: jobId }) });
    assert.equal(response.status, 200);
    assert.equal(db.saved.length, 2);
    assert.equal(db.saved[0].content, 'Original first');
  });
  it('never imports another account’s job', async () => {
    const db = fakeDatabase();
    const entries = initialEntries(groups); entries.forEach((entry) => { entry.decision = 'APPROVE'; });
    const response = await importRoute.POST(await request(JSON.stringify(buildReviewPayload(entries)), 'other-user'), { params: Promise.resolve({ id: jobId }) });
    assert.equal(response.status, 409);
    assert.equal(db.claims(), 0);
    assert.equal(db.saved.length, 0);
  });
  it('rejects suspended users before looking up a job', async () => {
    const db = fakeDatabase();
    mock.method(prisma.user, 'findUnique', async () => ({ id: 'owner', role: 'USER', status: 'SUSPENDED' }));
    const response = await importRoute.POST(await request(), { params: Promise.resolve({ id: jobId }) });
    assert.equal(response.status, 401);
    assert.equal(db.claims(), 0);
  });
  it('lists at most 20 owner-scoped metadata entries, with no extraction result or signed URL', async () => {
    fakeDatabase();
    const listing = mock.method(prisma.ingestionJob, 'findMany', async () => []);
    const signed = await request();
    const response = await listRoute.GET(new Request('https://api.example/api/v1/ingestions', { headers: signed.headers }));
    assert.equal(response.status, 200);
    const args = listing.mock.calls[0].arguments[0];
    assert.ok(args?.select);
    assert.deepEqual(args.where, { ownerId: 'owner' });
    assert.equal(args.take, 20);
    assert.deepEqual(args.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
    assert.equal('result' in args.select, false);
    assert.equal('url' in args.select, false);
    assert.match(response.headers.get('cache-control')!, /no-store/);
  });
});

describe('real reviewed contribution route with mocked database', () => {
  it('submits only approved edits, removes legacy paths and preserves owner media; prevents duplicates', async () => {
    const audioId = '00000000-0000-4000-8000-000000000002';
    const source = { data: [{ ...groups[0], group: { groupType: 'AUDIO', audioAssetId: audioId, audioUrl: '/uploads/private.mp3' } }] };
    fakeDatabase(source, audioId);
    let existing = false;
    mock.method(prisma.contentContribution, 'findUnique', async () => existing ? { id: 'existing', status: 'PENDING' } : null);
    const created = mock.method(prisma.contentContribution, 'create', async () => { existing = true; return { id: 'created', status: 'PENDING', createdAt: new Date() }; });
    const entries = initialEntries(groups);
    entries[0].decision = 'APPROVE'; entries[0].question.correctAnswer = 'B'; entries[1].decision = 'SKIP';
    const payload = JSON.stringify({ jobId, ...buildReviewPayload(entries), rightsConfirmed: true });
    const response = await contributionRoute.POST(await request(payload));
    assert.equal(response.status, 201);
    assert.equal((await response.json()).questionsSubmitted, 1);
    const args = created.mock.calls[0].arguments[0];
    assert.ok(args);
    assert.equal(args.data.ownerId, 'owner');
    const data = args.data.data as unknown as typeof source;
    assert.equal(data.data[0].questions.length, 1);
    assert.equal(data.data[0].questions[0].correctAnswer, 'B');
    assert.equal(data.data[0].group.audioAssetId, audioId);
    assert.equal(data.data[0].group.audioUrl, null);
    assert.equal((await contributionRoute.POST(await request(payload))).status, 409);
    assert.equal(created.mock.callCount(), 1);
  });
  it('rejects a contribution missing a decision for an original question', async () => {
    fakeDatabase();
    const payload = { jobId, rightsConfirmed: true, reviews: [{ groupIndex: 0, questionIndex: 0, decision: 'APPROVE', question: groups[0].questions[0] }] };
    const response = await contributionRoute.POST(await request(JSON.stringify(payload)));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'REVIEW_INVALID');
  });
  it('rejects missing sharing rights before database access', async () => {
    fakeDatabase();
    const entries = initialEntries(groups); entries.forEach((entry) => { entry.decision = 'APPROVE'; });
    const response = await contributionRoute.POST(await request(JSON.stringify({ jobId, ...buildReviewPayload(entries), rightsConfirmed: false })));
    assert.equal(response.status, 400);
  });
  it('never publishes an image asset or foreign audio preserved in an unshareable AI result', async () => {
    fakeDatabase({ data: [{ ...groups[0], group: { groupType: 'AUDIO', audioAssetId: '00000000-0000-4000-8000-000000000003' } }] });
    const entries = initialEntries(groups); entries.forEach((entry) => { entry.decision = 'APPROVE'; });
    const response = await contributionRoute.POST(await request(JSON.stringify({ jobId, ...buildReviewPayload(entries), rightsConfirmed: true })));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'MEDIA_NOT_ALLOWED');
  });
});
