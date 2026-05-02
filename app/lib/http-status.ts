export type HttpStatusMessage = {
  title: string;
  message: string;
};

const DEFAULT_STATUS = 500;

const statusMessages: Record<number, HttpStatusMessage> = {
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

export function normalizeHttpErrorStatus(status: unknown) {
  return typeof status === "number" && status >= 400 ? status : DEFAULT_STATUS;
}

export function getHttpStatusMessage(status: number) {
  return statusMessages[status] ?? (status >= 500 ? statusMessages[500] : statusMessages[400]);
}
