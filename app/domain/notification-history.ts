import { getInstantTime } from "~/lib/date-time";

export type NotificationHistoryTrigger =
  | "event-start"
  | "event-end"
  | "reward-exchange-end"
  | "recruitment-start"
  | "shop-reset"
  | "feedback-reply"
  | "event-opinion-reply"
  | "connection-verification";

export type NotificationHistoryMessage =
  | { state: "available"; text: string }
  | { state: "unavailable"; text: "알림 내용을 불러올 수 없어요." };

export type NotificationHistoryAction =
  | { state: "available"; label: string; to: string }
  | { state: "unavailable"; text: "연결 화면을 열 수 없어요." };

export type NotificationHistoryItem = {
  uid: string;
  typeLabel: string;
  relativeTime: string;
  deliveredAt: string;
  message: NotificationHistoryMessage;
  action: NotificationHistoryAction | null;
  isUnread: boolean;
};

export type NotificationHistoryResponse = {
  notifications: NotificationHistoryItem[];
  snapshotMaxDeliveredAt: string | null;
  unreadCount?: number;
  error?: string;
};

export const NOTIFICATION_HISTORY_LIMIT = 20;

const NOTIFICATION_UID_MAX_LENGTH = 128;

const NOTIFICATION_TYPE_LABELS: Record<NotificationHistoryTrigger, string> = {
  "event-start": "이벤트 시작",
  "event-end": "이벤트 종료",
  "reward-exchange-end": "보상 교환 종료",
  "recruitment-start": "학생 모집 시작",
  "shop-reset": "상점 초기화",
  "feedback-reply": "제안/문의 답변",
  "event-opinion-reply": "이벤트 의견 답변",
  "connection-verification": "Discord 연결 확인",
};

export function isValidNotificationUid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= NOTIFICATION_UID_MAX_LENGTH &&
    value.trim() === value &&
    !hasControlCharacters(value)
  );
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

const INTERNAL_NOTIFICATION_ORIGIN = "https://mollulog.net";

type NotificationPayload = Record<string, unknown>;

function isRecord(value: unknown): value is NotificationPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMessage(payload: unknown): NotificationHistoryMessage {
  if (!isRecord(payload) || typeof payload.message !== "string" || payload.message.trim().length === 0) {
    return { state: "unavailable", text: "알림 내용을 불러올 수 없어요." };
  }

  return { state: "available", text: payload.message.trim() };
}

function isAllowedNotificationUrl(value: string): string | null {
  try {
    const url = new URL(value, INTERNAL_NOTIFICATION_ORIGIN);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "mollulog.net" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      !url.pathname.startsWith("/")
    ) {
      return null;
    }

    const isAllowedPath =
      url.pathname === "/notifications" || url.pathname.startsWith("/events/") || url.pathname.startsWith("/contact/");
    if (!isAllowedPath) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function readAction(payload: unknown): NotificationHistoryAction | null {
  if (!isRecord(payload) || payload.action === undefined || payload.action === null) {
    return null;
  }

  if (!isRecord(payload.action) || typeof payload.action.label !== "string" || typeof payload.action.url !== "string") {
    return { state: "unavailable", text: "연결 화면을 열 수 없어요." };
  }

  const label = payload.action.label.trim();
  const to = isAllowedNotificationUrl(payload.action.url.trim());
  if (!label || !to) {
    return { state: "unavailable", text: "연결 화면을 열 수 없어요." };
  }

  return { state: "available", label, to };
}

export function getNotificationTypeLabel(trigger: unknown): string {
  if (typeof trigger !== "string") {
    return "알림";
  }

  return NOTIFICATION_TYPE_LABELS[trigger as NotificationHistoryTrigger] ?? "알림";
}

export function formatNotificationRelativeTime(deliveredAt: Date | string, now: Date | string = new Date()): string {
  const deliveredAtTime = getInstantTime(deliveredAt);
  const nowTime = getInstantTime(now);
  if (!Number.isFinite(deliveredAtTime) || !Number.isFinite(nowTime)) {
    return "방금";
  }

  const elapsedMinutes = Math.max(0, Math.floor((nowTime - deliveredAtTime) / 60_000));
  if (elapsedMinutes < 1) {
    return "방금";
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}분 전`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}시간 전`;
  }

  return `${Math.floor(elapsedHours / 24)}일 전`;
}

export function toNotificationHistoryItem({
  uid,
  trigger,
  payload,
  deliveredAt,
  isUnread,
  now = new Date(),
}: {
  uid: unknown;
  trigger: unknown;
  payload: unknown;
  deliveredAt: Date;
  isUnread: unknown;
  now?: Date;
}): NotificationHistoryItem | null {
  if (!isValidNotificationUid(uid) || typeof isUnread !== "boolean") {
    return null;
  }

  return {
    uid,
    typeLabel: getNotificationTypeLabel(trigger),
    relativeTime: formatNotificationRelativeTime(deliveredAt, now),
    deliveredAt: deliveredAt.toISOString(),
    message: readMessage(payload),
    action: readAction(payload),
    isUnread,
  };
}

export function isValidNotificationWatermark(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  return Number.isFinite(new Date(value).getTime());
}
