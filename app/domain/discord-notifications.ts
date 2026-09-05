import type { DiscordNotificationTrigger } from "~/db/postgres/schema";

export const DISCORD_NOTIFICATION_COMPLETION_MESSAGE = "몰루로그 Discord 알림 연결이 완료되었습니다.";
export const DISCORD_NOTIFICATION_FEEDBACK_REPLY_MESSAGE = "작성한 제안/문의에 운영팀 답변이 등록되었습니다.";
export const DISCORD_NOTIFICATION_EVENT_OPINION_REPLY_MESSAGE = "작성한 이벤트 의견에 새 답글이 등록되었습니다.";

export const DISCORD_NOTIFICATION_DEFAULTS = {
  eventStartEnabled: false,
  eventEndEnabled: false,
  rewardExchangeEndEnabled: false,
  recruitmentStartEnabled: false,
  shopResetEnabled: false,
  feedbackReplyEnabled: false,
  eventOpinionReplyEnabled: false,
  leadHours: 24,
};

export type DiscordOAuthStateValue = {
  state: string;
  userId: number;
  createdAt: number;
};

export function isDiscordOAuthStateValid(
  value: unknown,
  returnedState: string | null,
  userId: number,
  now = Date.now(),
): value is DiscordOAuthStateValue {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<DiscordOAuthStateValue>;
  const age = now - Number(state.createdAt);
  return (
    typeof state.state === "string" &&
    state.state === returnedState &&
    state.userId === userId &&
    Number.isFinite(state.createdAt) &&
    age >= 0 &&
    age <= 10 * 60 * 1000
  );
}

export type DiscordNotificationSettingsInput = {
  eventStartEnabled: boolean;
  eventEndEnabled: boolean;
  rewardExchangeEndEnabled: boolean;
  recruitmentStartEnabled: boolean;
  shopResetEnabled: boolean;
  feedbackReplyEnabled: boolean;
  eventOpinionReplyEnabled: boolean;
  leadHours: number;
};

export class DiscordNotificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscordNotificationValidationError";
  }
}

export class MissingNotificationNameError extends Error {
  constructor() {
    super("알림에 필요한 이름을 확인할 수 없어 작업을 만들지 못했습니다.");
    this.name = "MissingNotificationNameError";
  }
}

export function validateDiscordNotificationSettings(
  input: DiscordNotificationSettingsInput,
): DiscordNotificationSettingsInput {
  if (!Number.isInteger(input.leadHours) || input.leadHours < 1 || input.leadHours > 24) {
    throw new DiscordNotificationValidationError("알림 시점은 1시간 전부터 24시간 전까지 선택할 수 있어요.");
  }
  return { ...input, leadHours: input.leadHours };
}

export type KstDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};

export function getKstDateParts(value: Date | string): KstDateParts {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DiscordNotificationValidationError("알림 기준 시간이 올바르지 않아요.");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    calendar: "gregory",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const valueFor = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
  const weekday = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" }).format(date);
  return {
    year: valueFor("year"),
    month: valueFor("month"),
    day: valueFor("day"),
    hour: valueFor("hour"),
    minute: valueFor("minute"),
    weekday,
  };
}

export function plannedSendAtForAnchor(sourceAnchor: Date | string, leadHours: number): Date {
  validateDiscordNotificationSettings({ ...DISCORD_NOTIFICATION_DEFAULTS, leadHours });
  const anchor = sourceAnchor instanceof Date ? sourceAnchor : new Date(sourceAnchor);
  if (Number.isNaN(anchor.getTime())) {
    throw new DiscordNotificationValidationError("알림 기준 시간이 올바르지 않아요.");
  }
  return new Date(anchor.getTime() - leadHours * 60 * 60 * 1000);
}

export function isPastEffectiveAt(plannedSendAt: Date | string, effectiveAt: Date | string): boolean {
  return new Date(plannedSendAt).getTime() < new Date(effectiveAt).getTime();
}

export function formatKstNotificationTime(value: Date | string): string {
  const parts = getKstDateParts(value);
  return `${parts.month}/${parts.day}(${parts.weekday}) ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function requireName(name: string | null | undefined): string {
  const normalized = name?.trim();
  if (!normalized) throw new MissingNotificationNameError();
  return normalized;
}

export function formatDiscordNotificationMessage({
  trigger,
  sourceAnchor,
  contentName,
  studentNames = [],
}: {
  trigger: DiscordNotificationTrigger;
  sourceAnchor: Date | string;
  contentName?: string | null;
  studentNames?: readonly (string | null | undefined)[];
}): string {
  if (trigger === "feedback-reply") return DISCORD_NOTIFICATION_FEEDBACK_REPLY_MESSAGE;
  if (trigger === "event-opinion-reply") return DISCORD_NOTIFICATION_EVENT_OPINION_REPLY_MESSAGE;

  const at = formatKstNotificationTime(sourceAnchor);
  if (trigger === "recruitment-start") {
    const names = studentNames.map(requireName);
    if (names.length === 0) throw new MissingNotificationNameError();
    return `${at}, ${names.map((name) => `"${name}"`).join(", ")} 학생의 모집이 시작됩니다.`;
  }

  if (trigger === "shop-reset") return `${at}, 상점이 초기화됩니다.`;

  const name = requireName(contentName);
  switch (trigger) {
    case "event-start":
      return `${at}, "${name}" 이벤트가 시작됩니다.`;
    case "event-end":
      return `${at}, "${name}" 이벤트가 종료됩니다.`;
    case "reward-exchange-end":
      return `${at}, "${name}" 이벤트의 보상 교환이 종료됩니다. 수령하지 않은 보상은 소멸되니 교환을 완료했는지 확인해주세요.`;
  }
}

export function getEnabledTriggers(settings: DiscordNotificationSettingsInput): DiscordNotificationTrigger[] {
  return [
    settings.eventStartEnabled ? "event-start" : null,
    settings.eventEndEnabled ? "event-end" : null,
    settings.rewardExchangeEndEnabled ? "reward-exchange-end" : null,
    settings.recruitmentStartEnabled ? "recruitment-start" : null,
    settings.shopResetEnabled ? "shop-reset" : null,
    settings.feedbackReplyEnabled ? "feedback-reply" : null,
    settings.eventOpinionReplyEnabled ? "event-opinion-reply" : null,
  ].filter((trigger): trigger is DiscordNotificationTrigger => trigger !== null);
}
