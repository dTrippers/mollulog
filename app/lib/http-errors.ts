import { data } from "react-router";
import { getHttpStatusMessage } from "./http-status";
import type { RouteErrorPayload } from "./route-error";

type ErrorDetails = Record<string, unknown>;

function createErrorPayload(code: string, message: string, details?: ErrorDetails): RouteErrorPayload {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

export function routeError(status: number, code: string, publicMessage = getHttpStatusMessage(status).message, details?: ErrorDetails) {
  return data(createErrorPayload(code, publicMessage, details), { status });
}
