import { isRouteErrorResponse } from "react-router";
import { getHttpStatusMessage, normalizeHttpErrorStatus } from "./http-status";

export type RouteErrorPayload = {
  error: {
    code?: string;
    message?: string;
    details?: unknown;
    data?: unknown;
  };
};

export type NormalizedRouteError = {
  status: number;
  title: string;
  message: string;
  code?: string;
  details?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractPayload(data: unknown): RouteErrorPayload["error"] | null {
  if (!isRecord(data)) {
    return null;
  }

  const error = data.error;
  if (typeof error === "string") {
    return { message: error };
  }

  if (!isRecord(error)) {
    return null;
  }

  const message = typeof error.message === "string" ? error.message : undefined;
  const code = typeof error.code === "string" ? error.code : undefined;
  const details = error.details ?? error.data;

  return { code, message, details };
}

export function normalizeRouteError(error: unknown): NormalizedRouteError {
  const status = isRouteErrorResponse(error)
    ? normalizeHttpErrorStatus(error.status)
    : error instanceof Response
      ? normalizeHttpErrorStatus(error.status)
      : normalizeHttpErrorStatus(undefined);
  const fallback = getHttpStatusMessage(status);

  if (isRouteErrorResponse(error)) {
    const payload = extractPayload(error.data);
    const message = status >= 500 ? fallback.message : (payload?.message ?? fallback.message);
    return {
      status,
      title: fallback.title,
      message,
      code: payload?.code,
      details: payload?.details,
    };
  }

  return {
    status,
    title: fallback.title,
    message: fallback.message,
  };
}

export function isServerRouteError(error: NormalizedRouteError) {
  return error.status >= 500;
}
