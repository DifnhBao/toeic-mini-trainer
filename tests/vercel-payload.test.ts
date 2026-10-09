import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

test("deployment manifest must contain shared runtime sources and root tracing entry points and exclude secret/data files", () => {
  const tracked = spawnSync("git", ["ls-files", "-z", "app", "types", "prisma", "shared"], { encoding: "utf8", windowsHide: true });
  assert.equal(tracked.status, 0);
  const paths = [...tracked.stdout.split("\0").filter(Boolean), "proxy.ts", "instrumentation.ts"];
  const directory = mkdtempSync(resolve(tmpdir(), "toeic-payload-"));
  const file = resolve(directory, "manifest.json");
  const check = (entries: string[]) => {
    writeFileSync(file, JSON.stringify({ files: entries.map(path => ({ path, mode: 33188 })) }));
    return spawnSync(process.execPath, ["--experimental-strip-types", "scripts/check-vercel-payload.mts", file], {
      encoding: "utf8", windowsHide: true,
    });
  };
  try {
    assert.equal(check(paths).status, 0);
    for (const missing of ["proxy.ts", "instrumentation.ts", "shared/response-diagnostics.ts", "shared/learning-insights.ts"]) {
      const result = check(paths.filter(path => path !== missing));
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes(`Missing application files: ${missing}`));
    }
    for (const excluded of [".env.production", "Test/backups/private.bin", "output/ets/key.json"]) {
      const result = check([...paths, excluded]);
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes(`Excluded files present: ${excluded}`));
    }
  } finally {
    // mkdtemp created this exact directory; no user/workspace files are removed.
    rmSync(directory, { recursive: true, force: true });
  }
});
