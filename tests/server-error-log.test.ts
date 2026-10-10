import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { logServerError, safeErrorType } from "../app/lib/server-error-log";
import { onRequestError } from "../instrumentation";

const secret = "DO_NOT_LOG_signed_url_token_password_pdf_account";
test("error log retains only a known type and fixed event, excluding SDK metadata, stack and cause", () => {
  const captured: unknown[][] = [];
  const logger = mock.method(console, "error", (...args: unknown[]) => { captured.push(args); });
  try {
    const error = Object.assign(new TypeError(secret, { cause: new Error(secret) }), {
      $metadata: { httpStatusCode: 503, requestId: secret },
      $response: { headers: { authorization: secret }, body: secret },
      signedUrl: `https://private.invalid/?token=${secret}`,
      toJSON() { throw new Error("Error must never be serialized"); },
    });
    logServerError("upload.complete.failed", error);
    assert.equal(captured.length, 1); assert.equal(captured[0].length, 1);
    const value = JSON.parse(captured[0][0] as string);
    assert.deepEqual(Object.keys(value).sort(), ["errorType", "event", "timestamp"]);
    assert.equal(value.event, "upload.complete.failed"); assert.equal(value.errorType, "TypeError");
    assert.ok(Number.isFinite(Date.parse(value.timestamp)));
    assert.ok(!JSON.stringify(captured).includes(secret));
  } finally { logger.mock.restore(); }
});
test("untrusted error names, arbitrary throws and hostile getters are never logged", () => {
  const named = new Error("message"); named.name = secret;
  const hostile = new Error(); Object.defineProperty(hostile, "name", { get() { throw new Error(secret); } });
  const revoked = Proxy.revocable(new Error(), {}); revoked.revoke();
  for (const value of [named, hostile, revoked.proxy, secret, { name: "TypeError", message: secret }, null, undefined]) {
    assert.equal(safeErrorType(value), "UnknownError");
  }
  assert.equal(safeErrorType(new Error(secret)), "Error");
  let reads = 0;
  const changing = new Error(); Object.defineProperty(changing, "name", { get() { return reads++ === 0 ? "TypeError" : secret; } });
  assert.equal(safeErrorType(changing), "TypeError"); assert.equal(reads, 1);
});
test("Next error hook omits headers/path/query/error payload and preserves route template", async () => {
  const captured: unknown[][] = [];
  const logger = mock.method(console, "error", (...args: unknown[]) => { captured.push(args); });
  try {
    const error = Object.assign(new Error(secret), { name: secret });
    await onRequestError(error, { path: `/private/${secret}?token=${secret}`, method: "GET", headers: { authorization: secret } }, {
      routerKind: "App Router", routePath: "/api/v1/uploads/[id]", routeType: "route",
      renderSource: "server-rendering", revalidateReason: undefined,
    });
    const value = JSON.parse(captured[0][0] as string);
    assert.equal(value.event, "server.request.failed"); assert.equal(value.route, "/api/v1/uploads/[id]");
    assert.equal(value.method, "GET"); assert.equal(value.errorType, "UnknownError");
    assert.ok(!JSON.stringify(captured).includes(secret));
  } finally { logger.mock.restore(); }
});
