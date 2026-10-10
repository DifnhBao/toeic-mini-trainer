import type { Instrumentation } from "next";
import { safeErrorType } from "./app/lib/server-error-log";
import { REQUEST_ID_HEADER, requestIdFields } from "./app/lib/request-trace";

// Structured server error events for the host log/alert pipeline. Never log
// request bodies, headers, query strings, tokens or raw provider errors.
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  console.error(JSON.stringify({
    event: "server.request.failed",
    timestamp: new Date().toISOString(),
    ...requestIdFields(request.headers[REQUEST_ID_HEADER]),
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    errorType: safeErrorType(error),
  }));
};
