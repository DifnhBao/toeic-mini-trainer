import type { Instrumentation } from "next";

// Structured server error events for the host log/alert pipeline. Never log
// request bodies, headers, query strings, tokens or raw provider errors.
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  console.error(JSON.stringify({
    event: "server.request.failed",
    timestamp: new Date().toISOString(),
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    errorType: error instanceof Error ? error.name : "UnknownError",
  }));
};
