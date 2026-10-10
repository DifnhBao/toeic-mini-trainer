import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { normalizeRequestId, requestIdFields, requestLogFields } from "../app/lib/request-trace";
import { logServerError } from "../app/lib/server-error-log";
import { onRequestError } from "../instrumentation";

const callerId = "11111111-1111-4111-8111-111111111111";
const secret = "DO_NOT_LOG_cookie_auth_query_document";

test("API proxy replaces caller ID, forwards credentials internally and returns an independent server ID", () => {
  const request = new NextRequest("http://localhost/api/v1/ingestions", { headers: {
    "x-request-id": callerId, authorization: secret, cookie: `session=${secret}`,
  } });
  const response = proxy(request);
  const id = response.headers.get("x-request-id");
  assert.equal(normalizeRequestId(id), id);
  assert.notEqual(id, callerId);
  assert.notEqual(proxy(request).headers.get("x-request-id"), id);
  assert.equal(response.headers.get("x-middleware-request-x-request-id"), id);
  assert.equal(response.headers.get("x-middleware-request-authorization"), secret);
  assert.equal(response.headers.get("x-middleware-request-cookie"), `session=${secret}`);
  assert.equal(response.headers.get("authorization"), null);
  assert.equal(response.headers.get("cookie"), null);
  assert.equal(request.headers.get("x-request-id"), callerId);
});

test("only a bounded UUID v4 is eligible for a request log field", () => {
  assert.deepEqual(requestIdFields(callerId), { requestId: callerId });
  for (const value of [secret, "", null, undefined, [callerId], {}, `${callerId},${callerId}`,
    ` ${callerId}`, `${callerId}\n`, "11111111-1111-1111-8111-111111111111"]) {
    assert.deepEqual(requestIdFields(value), {});
  }
  assert.deepEqual(requestLogFields(), {});
});

test("handled API error logs correlate by ID without exposing request or error payload", () => {
  const captured: unknown[][] = [];
  const logger = mock.method(console, "error", (...args: unknown[]) => { captured.push(args); });
  try {
    logServerError("upload.complete.failed", new Error(secret), new Request(`http://localhost/${secret}?token=${secret}`, {
      headers: { "x-request-id": callerId, authorization: secret, cookie: secret },
    }));
    const event = JSON.parse(captured[0][0] as string);
    assert.deepEqual(Object.keys(event).sort(), ["errorType", "event", "requestId", "timestamp"]);
    assert.equal(event.requestId, callerId);
    assert.ok(!JSON.stringify(captured).includes(secret));
  } finally { logger.mock.restore(); }
});

test("framework hook correlates the forwarded ID and omits malformed or repeated headers", async () => {
  const captured: unknown[][] = [];
  const logger = mock.method(console, "error", (...args: unknown[]) => { captured.push(args); });
  try {
    for (const value of [callerId, secret, [callerId]]) {
      await onRequestError(new Error(secret), {
        method: "POST", path: `/${secret}`, headers: { "x-request-id": value, authorization: secret },
      }, {
        routerKind: "App Router", routePath: "/api/v1/ingestions", routeType: "route",
        renderSource: "server-rendering", revalidateReason: undefined,
      });
    }
    assert.equal(JSON.parse(captured[0][0] as string).requestId, callerId);
    assert.equal(JSON.parse(captured[1][0] as string).requestId, undefined);
    assert.equal(JSON.parse(captured[2][0] as string).requestId, undefined);
    assert.ok(!JSON.stringify(captured).includes(secret));
  } finally { logger.mock.restore(); }
});
