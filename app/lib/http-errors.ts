import { data } from "react-router";
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

function defaultMessageForStatus(status: number) {
  if (status === 400) return "입력한 내용을 확인한 뒤 다시 시도해주세요.";
  if (status === 401) return "계속하려면 먼저 로그인해주세요.";
  if (status === 403) return "이 페이지를 볼 수 있는 권한이 없어요.";
  if (status === 404) return "주소가 올바른지 확인해주세요.";
  if (status === 405) return "현재 방식으로는 요청을 처리할 수 없어요.";
  return "잠시 후 다시 시도해주세요.";
}

export function routeError(status: number, code: string, publicMessage = defaultMessageForStatus(status), details?: ErrorDetails) {
  return data(createErrorPayload(code, publicMessage, details), { status });
}

export function apiError(status: number, code: string, publicMessage = defaultMessageForStatus(status), details?: ErrorDetails) {
  return data(createErrorPayload(code, publicMessage, details), { status });
}

export function apiOk<T extends Record<string, unknown>>(payload?: T) {
  return data({ success: true as const, ...(payload ?? {}) });
}
