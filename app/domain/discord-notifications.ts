import type { DiscordNotificationTimingMode, DiscordNotificationTrigger } from "~/db/postgres/schema";

export const DISCORD_NOTIFICATION_COMPLETION_MESSAGE = "몰루로그 Discord 알림 연결이 완료되었습니다.";

export const DISCORD_NOTIFICATION_DEFAULTS = {
  eventStartEnabled: false,
  eventEndEnabled: false,
  rewardExchangeEndEnabled: false,
  recruitmentStartEnabled: false,
  timingMode: "day-before" as const,
  kstHour: 11,
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
  timingMode: DiscordNotificationTimingMode;
  kstHour: number;
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
  if (input.timingMode !== "day-before" && input.timingMode !== "same-day") {
    throw new DiscordNotificationValidationError("알림 시점을 선택해주세요.");
  }
  if (!Number.isInteger(input.kstHour) || input.kstHour < 0 || input.kstHour > 23) {
    throw new DiscordNotificationValidationError("알림 시간은 0시부터 23시까지 선택할 수 있어요.");
  }
  return { ...input, kstHour: input.kstHour };
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

function kstDateAt(parts: Pick<KstDateParts, "year" | "month" | "day">, hour: number): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour, 0, 0, 0) - 9 * 60 * 60 * 1000);
}

export function plannedSendAtForAnchor(
  sourceAnchor: Date | string,
  timingMode: DiscordNotificationTimingMode,
  kstHour: number,
): Date {
  validateDiscordNotificationSettings({ ...DISCORD_NOTIFICATION_DEFAULTS, timingMode, kstHour });
  const parts = getKstDateParts(sourceAnchor);
  if (timingMode === "same-day") {
    return kstDateAt(parts, kstHour);
  }

  const previousDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1, 12, 0, 0));
  return kstDateAt(
    {
      year: previousDay.getUTCFullYear(),
      month: previousDay.getUTCMonth() + 1,
      day: previousDay.getUTCDate(),
    },
    kstHour,
  );
}

/** Same-day alerts are omitted when their configured time is after the source anchor. */
export function isNotificationScheduleEligible(
  sourceAnchor: Date | string,
  timingMode: DiscordNotificationTimingMode,
  kstHour: number,
): boolean {
  if (timingMode !== "same-day") return true;
  return plannedSendAtForAnchor(sourceAnchor, timingMode, kstHour).getTime() <= new Date(sourceAnchor).getTime();
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
  const at = formatKstNotificationTime(sourceAnchor);
  if (trigger === "recruitment-start") {
    const names = studentNames.map(requireName);
    if (names.length === 0) throw new MissingNotificationNameError();
    return `${at}, ${names.map((name) => `"${name}"`).join(", ")} 학생의 모집이 시작됩니다.`;
  }

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
  ].filter((trigger): trigger is DiscordNotificationTrigger => trigger !== null);
}
