import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Prisma } from "@prisma/client";
import { SignJWT } from "jose";

// Never accept a remote API/DB or silently fall back to project .env.
const database = process.env.TEST_DATABASE_URL;
if (!database || process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") throw new Error("Explicit isolated local database and opt-in required");
const db = new URL(database);
if (!["127.0.0.1", "localhost", "[::1]"].includes(db.hostname) || db.pathname !== "/toeic_release_test" || db.searchParams.get("sslmode") !== "disable" || [...db.searchParams.keys()].some(key => key !== "sslmode") || process.env.NODE_ENV === "production") {
  throw new Error("HTTP benchmark only accepts isolated loopback toeic_release_test with sslmode=disable");
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildId = readFileSync(resolve(root, ".next/BUILD_ID"), "utf8").trim();
const runId = randomUUID();
const port = 3807;
const base = `http://127.0.0.1:${port}`;
const quick = process.argv.includes("--quick");
if (process.argv.slice(2).some(arg => arg !== "--quick")) throw new Error("Only --quick is supported; API target is fixed to loopback");
const rounds = quick ? 1 : 10;
const historyCount = quick ? 10 : 1000;
const questionCount = quick ? 1000 : 10_000;
const jwtSecret = randomBytes(48).toString("base64url");
const owner = randomUUID(), documentId = randomUUID();
const users = Array.from({ length: 20 }, () => ({ id: randomUUID(), testId: randomUUID(), completed: 0, token: "", testIds: new Set<string>() }));
const batches = Array.from({ length: questionCount / 500 }, () => ({ job: randomUUID(), contribution: randomUUID() }));
const groups = Array.from({ length: questionCount / 20 }, (_, index) => ({ id: randomUUID(), ownerId: null, contributionId: batches[Math.floor(index / 25)].contribution, groupType: "TEXT" as const }));
const questions = Array.from({ length: questionCount }, (_, index) => ({
  id: randomUUID(), ownerId: null, groupId: groups[Math.floor(index / 20)].id,
  contributionId: batches[Math.floor(index / 500)].contribution, publicationStatus: "PUBLISHED" as const,
  part: 5, content: `Original synthetic HTTP load question ${index + 1}`, options: { A: "a", B: "b", C: "c", D: "d" }, correctAnswer: "A",
}));
const questionIds = new Set<string>(questions.map(question => question.id));
const groupIds = new Set<string>(groups.map(group => group.id));
const selectedIds = questions.slice(0, 20).map(question => question.id);
const allUserIds = [owner, ...users.map(user => user.id)];
db.searchParams.set("application_name", `http-load-controller-${runId}`);
process.env.DATABASE_URL = db.toString();
const { prisma } = await import("../app/lib/prisma");
let child: ChildProcess | undefined;
let serverLog: number | undefined;
let measuring = false, inFlight = 0, peakInFlight = 0;
let cleaned = false, serverStopped = false;
const abort = new AbortController();
const samples = new Map<string, Array<{ ms: number; status: number }>>();
const guards: string[] = [];
const reportPath = resolve(root, `Test/http-learning-${quick ? "quick" : "full"}.json`);
const snapshot = { maximumConnections: 0, maximumActive: 0, samples: 0 };
let monitor: NodeJS.Timeout | undefined;
let monitoring: Promise<void> = Promise.resolve();
const abortRun = () => abort.abort();
process.once("SIGINT", abortRun); process.once("SIGTERM", abortRun);
const statistics = (rows: Array<{ ms: number; status: number }>) => {
  const sorted = rows.map(row => row.ms).sort((a, b) => a - b);
  return { calls: rows.length, p50Ms: Number(sorted[Math.ceil(sorted.length * .5) - 1].toFixed(2)),
    p95Ms: Number(sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2)), maximumMs: Number(sorted.at(-1)!.toFixed(2)),
    statuses: Object.fromEntries([...new Set(rows.map(row => row.status))].map(status => [status, rows.filter(row => row.status === status).length])) };
};
async function http(path: string, token: string | null, expected: number, label: string, body?: object) {
  assert.equal(new URL(path, base).origin, base, "Requests must remain on loopback");
  const started = performance.now(); let status = 0;
  inFlight++; if (measuring) peakInFlight = Math.max(peakInFlight, inFlight);
  try {
    const response = await fetch(new URL(path, base), { method: body ? "POST" : "GET", redirect: "error",
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)]) });
    status = response.status;
    const data = await response.json();
    assert.equal(status, expected, `${label} returned ${status} (${data?.error?.code || "unexpected response"})`);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    return data;
  } finally {
    inFlight--;
    if (measuring) { const rows = samples.get(label) || []; rows.push({ ms: performance.now() - started, status }); samples.set(label, rows); }
  }
}
function checkSummary(user: typeof users[number], result: { totalTests: number; totalAnswered: number; overallAccuracy: number; partStats: Array<{ part: number; total: number; accuracy: number }> }) {
  assert.equal(result.totalTests, historyCount + user.completed);
  assert.equal(result.totalAnswered, 20 * (historyCount + user.completed));
  const accuracy = Math.round((historyCount * 10 + user.completed * 20) / result.totalAnswered * 100);
  assert.equal(result.overallAccuracy, accuracy);
  assert.deepEqual(result.partStats, [{ part: 5, total: result.totalAnswered, accuracy }]);
}
async function journey(user: typeof users[number], iteration: number) {
  const catalogue = await http("/api/v1/library", user.token, 200, "catalogue");
  assert.equal(catalogue.lessons.length, 20);
  assert.equal(new Set(catalogue.lessons.map((lesson: { id: string }) => lesson.id)).size, 20);
  assert.ok(catalogue.lessons.every((lesson: { id: string; playable: boolean; questionCount: number }) => groupIds.has(lesson.id) && lesson.playable && lesson.questionCount === 20));
  checkSummary(user, await http("/api/v1/progress", user.token, 200, "progress-before"));
  const history = await http("/api/v1/attempts", user.token, 200, "history");
  assert.equal(history.attempts.length, Math.min(20, historyCount + user.completed));
  assert.ok(history.attempts.every((attempt: { testId: string }) => user.testIds.has(attempt.testId)));
  const made = iteration % 2 === 0
    ? await http("/api/v1/tests", user.token, 201, "create-random", { count: 20, parts: [5] })
    : await http(`/api/v1/library/${catalogue.lessons[0].id}/test`, user.token, 201, "create-library", {});
  user.testIds.add(made.test.id);
  const detail = await http(`/api/v1/tests/${made.test.id}`, user.token, 200, "test-detail");
  assert.equal(detail.test.ownerId, user.id);
  assert.equal(detail.test.questions.length, 20); assert.ok(!JSON.stringify(detail).includes("correctAnswer"));
  const ids = detail.test.questions.map((item: { question: { id: string; part: number; group?: { id: string } | null } }) => {
    assert.equal(item.question.part, 5); assert.ok(questionIds.has(item.question.id)); return item.question.id;
  });
  if (iteration % 2 !== 0) assert.ok(detail.test.questions.every((item: { question: { group?: { id: string } | null } }) => item.question.group?.id === catalogue.lessons[0].id), "Library test must use the selected lesson's questions");
  assert.equal(new Set(ids).size, 20);
  const body = { clientSubmissionId: randomUUID(), durationSeconds: 600, answers: Object.fromEntries(ids.map((id: string) => [id, "A"])) };
  const submitted = await Promise.all([0, 1].map(() => http(`/api/v1/tests/${made.test.id}/submit`, user.token, 200, "submit-with-retry", body)));
  assert.equal(submitted[0].attemptId, submitted[1].attemptId);
  for (const result of submitted) { assert.equal(result.score, 20); assert.equal(result.total, 20); }
  const attempt = await http(`/api/v1/attempts/${submitted[0].attemptId}`, user.token, 200, "attempt-detail");
  assert.equal(attempt.attempt.test.id, made.test.id); assert.equal(attempt.attempt.score, 20); assert.equal(attempt.attempt.userAnswers.length, 20);
  assert.ok(attempt.attempt.userAnswers.every((answer: { isCorrect: boolean }) => answer.isCorrect));
  user.completed++;
  checkSummary(user, await http("/api/v1/progress", user.token, 200, "progress-after"));
}
async function wave(iteration: number) {
  const results = await Promise.allSettled(users.map(user => journey(user, iteration)));
  for (const result of results) if (result.status === "rejected") throw result.reason;
}
async function stopServer() {
  if (!child || child.exitCode !== null || child.signalCode !== null) { serverStopped = true; return; }
  const stopped = new Promise<void>(resolve => child!.once("exit", () => resolve()));
  child.kill("SIGTERM");
  await Promise.race([stopped, delay(10_000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await Promise.race([stopped, delay(5000)]); }
  assert.ok(child.exitCode !== null || child.signalCode !== null, "Local HTTP server did not stop");
  serverStopped = true;
}
let failure: unknown;
let measuredMs = 0;
try {
  await new Promise<void>((resolve, reject) => { const probe = createServer(); probe.once("error", reject); probe.listen(port, "127.0.0.1", () => probe.close(error => error ? reject(error) : resolve())); });
  console.log(`Preparing ${users.length} users, ${questionCount} questions and ${20 * historyCount * users.length} historical answers in isolated DB`);
  await prisma.user.createMany({ data: allUserIds.map(id => ({ id, email: `${id}@http-load.invalid`, role: id === owner ? "ADMIN" as const : "USER" as const })) });
  await prisma.uploadedAsset.create({ data: { id: documentId, ownerId: owner, kind: "DOCUMENT", status: "READY", objectKey: `local-http-fixture/${runId}.pdf`, originalName: "synthetic-fixture.pdf", contentType: "application/pdf", sizeBytes: 5 } });
  for (const [index, batch] of batches.entries()) {
    abort.signal.throwIfAborted();
    const data = { data: Array.from({ length: 25 }, (_, group) => ({ group: { groupType: "TEXT" }, questions: questions.slice(index * 500 + group * 20, index * 500 + (group + 1) * 20).map(({ part, content, options, correctAnswer }) => ({ part, content, options, correctAnswer })) })) };
    await prisma.ingestionJob.create({ data: { id: batch.job, ownerId: owner, documentAssetId: documentId, status: "IMPORTED", result: data } });
    await prisma.contentContribution.create({ data: { id: batch.contribution, ownerId: owner, sourceJobId: batch.job, status: "APPROVED", data } });
  }
  await prisma.questionGroup.createMany({ data: groups });
  for (let n = 0; n < questions.length; n += 500) await prisma.question.createMany({ data: questions.slice(n, n + 500) });
  for (const user of users) {
    abort.signal.throwIfAborted();
    user.testIds.add(user.testId);
    await prisma.miniTest.create({ data: { id: user.testId, createdById: user.id, title: "Synthetic local history", questions: { create: selectedIds.map((questionId, index) => ({ questionId, orderIndex: index + 1 })) } } });
    await prisma.$executeRaw`INSERT INTO test_attempts (id, "userId", "testId", score, "durationSeconds", "completedAt") SELECT gen_random_uuid()::text, ${user.id}, ${user.testId}, 10, 600, clock_timestamp() - n * interval '1 second' FROM generate_series(1, ${historyCount}) n`;
    await prisma.$executeRaw(Prisma.sql`INSERT INTO user_answers (id, "attemptId", "questionId", "selectedOption", "isCorrect") SELECT gen_random_uuid()::text, t.id, q.id, CASE WHEN q.n % 2 = 0 THEN 'A' ELSE 'B' END, q.n % 2 = 0 FROM test_attempts t CROSS JOIN unnest(ARRAY[${Prisma.join(selectedIds)}]::text[]) WITH ORDINALITY AS q(id, n) WHERE t."userId" = ${user.id}`);
    user.token = await new SignJWT({ tokenUse: "access" }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuer("toeic-mini-trainer").setAudience("toeic-mobile").setExpirationTime("30m").sign(new TextEncoder().encode(jwtSecret));
  }
  await prisma.$executeRaw`ANALYZE questions, question_groups, content_contributions, test_attempts, user_answers`;
  mkdirSync(resolve(root, "Test"), { recursive: true });
  serverLog = openSync(resolve(root, `Test/http-learning-${quick ? "quick" : "full"}-server.log`), "w");
  const serverDb = new URL(database); serverDb.searchParams.set("application_name", `http-load-server-${runId}`);
  // Explicitly replace every credential/config name in .env.example so Next's
  // .env loading cannot reuse project credentials in the local test process.
  const cleared = Object.fromEntries([...readFileSync(resolve(root, ".env.example"), "utf8").matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(match => [match[1], ""]));
  child = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", serverLog, serverLog], env: { ...process.env, ...cleared,
      NODE_ENV: "production", DATABASE_URL: serverDb.toString(), MOBILE_JWT_SECRET: jwtSecret,
      NEXTAUTH_SECRET: randomBytes(48).toString("base64url"), AUTH_SECRET: randomBytes(48).toString("base64url"),
      GUEST_TEST_SECRET: randomBytes(48).toString("base64url"), NEXTAUTH_URL: base, AUTH_URL: base, AUTH_TRUST_HOST: "true",
      AI_ENABLED: "false", INGESTION_ENABLED: "false", RATE_LIMIT_STORE: "database", NEXT_TELEMETRY_DISABLED: "1" },
  });
  child.once("error", error => { failure = error; abort.abort(); });
  const deadline = Date.now() + 30_000; let ready = false;
  while (Date.now() < deadline && !ready) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Local production server exited during startup; see private server log");
    try { checkSummary(users[0], await http("/api/v1/progress", users[0].token, 200, "startup")); ready = true; }
    catch { await delay(250); }
  }
  assert.ok(ready, "Local production server readiness failed; see private server log");
  await http("/api/v1/progress", null, 401, "guard"); guards.push("unauthenticated denied");
  await http("/api/v1/progress", "invalid", 401, "guard"); guards.push("invalid token denied");
  await http(`/api/v1/tests/${users[1].testId}`, users[0].token, 404, "guard"); guards.push("foreign test denied");
  const foreign = await prisma.testAttempt.findFirstOrThrow({ where: { userId: users[1].id }, select: { id: true } });
  await http(`/api/v1/attempts/${foreign.id}`, users[0].token, 404, "guard"); guards.push("foreign attempt denied");
  console.log("Production HTTP server ready; warmup: 20 complete learner journeys");
  await wave(0);
  const sampleConnections = async () => {
    const rows = await prisma.$queryRaw<Array<{ total: bigint; active: bigint }>>`SELECT count(*) AS total, count(*) FILTER (WHERE state='active') AS active FROM pg_stat_activity WHERE application_name = ${`http-load-server-${runId}`}`;
    snapshot.maximumConnections = Math.max(snapshot.maximumConnections, Number(rows[0].total));
    snapshot.maximumActive = Math.max(snapshot.maximumActive, Number(rows[0].active)); snapshot.samples++;
  };
  monitor = setInterval(() => { monitoring = monitoring.then(sampleConnections).catch(error => { failure = error; abort.abort(); }); }, 1000);
  measuring = true; const started = performance.now();
  for (let round = 1; round <= rounds; round++) { await wave(round); console.log(`Measured round ${round}/${rounds} complete`); }
  measuredMs = performance.now() - started; measuring = false;
  clearInterval(monitor); monitor = undefined; await monitoring;
  for (const user of users) {
    assert.equal(await prisma.testAttempt.count({ where: { userId: user.id } }), historyCount + rounds + 1);
    assert.equal(await prisma.userAnswer.count({ where: { attempt: { userId: user.id } } }), 20 * (historyCount + rounds + 1));
  }
  await prisma.user.update({ where: { id: users[0].id }, data: { status: "SUSPENDED" } });
  await http("/api/v1/progress", users[0].token, 401, "guard"); guards.push("suspended account denied");
} catch (error) { failure = error; }
finally {
  measuring = false; if (monitor) clearInterval(monitor); await monitoring;
  try {
    await stopServer();
    await prisma.miniTest.deleteMany({ where: { createdById: { in: allUserIds } } });
    await prisma.question.deleteMany({ where: { id: { in: [...questionIds] } } });
    await prisma.questionGroup.deleteMany({ where: { id: { in: [...groupIds] } } });
    await prisma.contentContribution.deleteMany({ where: { id: { in: batches.map(batch => batch.contribution) } } });
    await prisma.ingestionJob.deleteMany({ where: { id: { in: batches.map(batch => batch.job) } } });
    await prisma.uploadedAsset.deleteMany({ where: { id: documentId } });
    const counterFilter = { OR: ["mobile-test-create", "mobile-test-submit"].flatMap(scope => users.map(user => ({ key: { endsWith: createHash("sha256").update(`${scope}:${user.id}`).digest("hex") } }))) };
    await prisma.userAiUsage.deleteMany({ where: counterFilter });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    assert.equal(await prisma.user.count({ where: { id: { in: allUserIds } } }), 0);
    assert.equal(await prisma.question.count({ where: { id: { in: [...questionIds] } } }), 0);
    assert.equal(await prisma.questionGroup.count({ where: { id: { in: [...groupIds] } } }), 0);
    assert.equal(await prisma.userAiUsage.count({ where: counterFilter }), 0);
    cleaned = true;
  } catch (error) { failure ||= error; }
  finally { await prisma.$disconnect(); if (serverLog !== undefined) closeSync(serverLog); }
  process.removeListener("SIGINT", abortRun); process.removeListener("SIGTERM", abortRun);
}
const git = spawnSync("git", ["log", "-1", "--format=%h", "--", "app", "types", "prisma"], { cwd: root, encoding: "utf8", windowsHide: true });
const rows = [...samples.values()].flat();
const report = {
  successful: !failure, runtimeSourceCommit: git.stdout.trim(), buildId, mode: quick ? "quick" : "full",
  concurrentLearners: users.length, peakHttpInFlight: peakInFlight, measuredRounds: rounds, warmupJourneys: users.length,
  fixture: { questions: questionCount, lessons: groups.length, attemptsPerUser: historyCount, historicalAnswers: users.length * historyCount * 20, distinctAnsweredQuestionsPerUser: 20 },
  measuredMs: Number(measuredMs.toFixed(2)), measuredRequests: rows.length, overall: rows.length ? statistics(rows) : null,
  requestsPerSecond: measuredMs ? Number((rows.length / measuredMs * 1000).toFixed(2)) : 0,
  endpoints: Object.fromEntries([...samples].map(([name, values]) => [name, statistics(values)])),
  postgres: snapshot, guards, cleaned, serverStopped, cloudWrites: false, providerCalls: false,
  scope: "Loopback Next production HTTP, JWT plus active-user lookup, local PostgreSQL; 20 closed-loop users, two concurrent requests per submission retry; excludes OAuth login, WAN, Vercel/Neon, media and AI",
  ...(failure ? { failure: failure instanceof Error ? failure.message : "Unknown benchmark failure" } : {}),
};
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failure) process.exitCode = 1;
