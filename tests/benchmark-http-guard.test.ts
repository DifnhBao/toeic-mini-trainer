import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { it } from "node:test";
import { resolve } from "node:path";

const local = "postgresql://test:test@127.0.0.1:55432/toeic_release_test?sslmode=disable";
for (const [name, url, flag, nodeEnv] of [
  ["missing explicit opt-in", local, "false", "test"],
  ["remote database", "postgresql://test:test@example.invalid/toeic_release_test?sslmode=disable", "true", "test"],
  ["different local database", local.replace("toeic_release_test", "postgres"), "true", "test"],
  ["missing local TLS setting", local.replace("?sslmode=disable", ""), "true", "test"],
  ["connection query overriding the local host", local + "&host=example.invalid", "true", "test"],
  ["production execution mode", local, "true", "production"],
] as const) {
  it(`HTTP load runner refuses ${name} before starting fixtures or a server`, () => {
    const run = spawnSync(process.execPath, ["--import", "tsx", resolve("scripts/benchmark-http-learning.mts"), "--quick"], {
      env: { ...process.env, TEST_DATABASE_URL: url, ALLOW_INTEGRATION_TEST_DATABASE: flag, NODE_ENV: nodeEnv },
      encoding: "utf8", windowsHide: true, timeout: 20_000,
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Explicit isolated local database|HTTP benchmark only accepts isolated loopback/);
    assert.doesNotMatch(run.stdout, /Preparing|HTTP server ready/);
  });
}
