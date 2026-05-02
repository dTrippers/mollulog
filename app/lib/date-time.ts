import dayjs from "./dayjs";

export type UtcIsoString = string;
export type LocalDateString = string;
export type TimeZoneId = string;

export const DEFAULT_TIME_ZONE: TimeZoneId = "UTC";

const UTC_OFFSET_PATTERN = /(z|[+-]\d{2}:?\d{2})$/i;

export function isValidTimeZone(value: string | null | undefined): value is TimeZoneId {
  if (!value) {
    return false;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function getBrowserTimeZone(): TimeZoneId | null {
  if (typeof Intl === "undefined") {
    return null;
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimeZone(timeZone) ? timeZone : null;
}

export function normalizeTimeZone(value: string | null | undefined): TimeZoneId {
  return isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE;
}

export function parseD1TimestampAsUtc(value: string): dayjs.Dayjs {
  return dayjs.utc(value);
}

export function parseUtcTimestamp(value: string | Date): dayjs.Dayjs {
  if (value instanceof Date) {
    return dayjs(value).utc();
  }

  if (UTC_OFFSET_PATTERN.test(value)) {
    return dayjs(value).utc();
  }

  return parseD1TimestampAsUtc(value);
}

export function normalizeInstant(value: string): UtcIsoString {
  return parseUtcTimestamp(value).toISOString();
}

export function normalizeUtcTimestamp(value: string): UtcIsoString {
  return normalizeInstant(value);
}

export function toUtcIso(value: string | Date | number): UtcIsoString {
  return dayjs(value).utc().toISOString();
}

export function nowUtcIso(): UtcIsoString {
  return new Date().toISOString();
}

export function compareInstantDesc(a: string | Date, b: string | Date): number {
  return parseUtcTimestamp(b).valueOf() - parseUtcTimestamp(a).valueOf();
}

export function compareInstantAsc(a: string | Date, b: string | Date): number {
  return parseUtcTimestamp(a).valueOf() - parseUtcTimestamp(b).valueOf();
}

export function getInstantTime(instant: string | Date): number {
  return parseUtcTimestamp(instant).valueOf();
}

export function isInstantAfter(a: string | Date, b: string | Date): boolean {
  return getInstantTime(a) > getInstantTime(b);
}

export function isInstantBefore(a: string | Date, b: string | Date): boolean {
  return getInstantTime(a) < getInstantTime(b);
}

export function formatInstantDateKey(instant: string | Date, timeZone: string | null | undefined): LocalDateString {
  return formatInstant(instant, { timeZone, format: "YYYY-MM-DD" }) as LocalDateString;
}

export function formatInstant(
  instant: string | Date,
  {
    timeZone,
    format = "YYYY.MM.DD",
  }: {
    timeZone?: string | null;
    format?: string;
  } = {},
): string {
  return parseUtcTimestamp(instant).tz(normalizeTimeZone(timeZone)).format(format);
}
