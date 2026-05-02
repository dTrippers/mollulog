import { isRouteErrorResponse } from "react-router";

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

const DEFAULT_STATUS = 500;

const statusMessages: Record<number, { title: string; message: string }> = {
  400: {
    title: "요청을 처리할 수 없어요",
    message: "입력한 내용을 확인한 뒤 다시 시도해주세요.",
  },
  401: {
    title: "로그인이 필요해요",
    message: "계속하려면 먼저 로그인해주세요.",
  },
  403: {
    title: "접근 권한이 없어요",
    message: "이 페이지를 볼 수 있는 권한이 없어요.",
  },
  404: {
    title: "페이지를 찾을 수 없어요",
    message: "주소가 올바른지 확인해주세요.",
  },
  405: {
    title: "지원하지 않는 요청이에요",
    message: "현재 방식으로는 요청을 처리할 수 없어요.",
  },
  500: {
    title: "알 수 없는 오류가 발생했어요",
    message: "잠시 후 다시 시도해주세요.",
  },
};

function fallbackForStatus(status: number) {
  return statusMessages[status] ?? (status >= 500 ? statusMessages[500] : statusMessages[400]);
}

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

function normalizeStatus(status: unknown) {
  return typeof status === "number" && status >= 400 ? status : DEFAULT_STATUS;
}

export function normalizeRouteError(error: unknown): NormalizedRouteError {
  const status = isRouteErrorResponse(error)
    ? normalizeStatus(error.status)
    : error instanceof Response
      ? normalizeStatus(error.status)
      : DEFAULT_STATUS;
  const fallback = fallbackForStatus(status);

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
