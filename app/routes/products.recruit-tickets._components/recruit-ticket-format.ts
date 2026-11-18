import { formatInstant, type UtcIsoString } from "~/lib/date-time";

// Dates of the current year leave out the year, in the display time zone.
function formatDate(instant: UtcIsoString, timeZone: string, now: UtcIsoString, withTime: boolean): string {
  const sameYear =
    formatInstant(instant, { timeZone, format: "YYYY" }) === formatInstant(now, { timeZone, format: "YYYY" });
  const date = sameYear ? "MM/DD" : "YYYY/MM/DD";
  return formatInstant(instant, { timeZone, format: withTime ? `${date} HH:mm` : date });
}

export function formatRecruitTicketPeriod(
  startAt: UtcIsoString | null,
  endAt: UtcIsoString | null,
  timeZone: string,
  now: UtcIsoString,
): string | null {
  if (startAt === null) return null;
  const start = formatDate(startAt, timeZone, now, false);
  return endAt === null ? `${start} ~` : `${start} ~ ${formatDate(endAt, timeZone, now, false)}`;
}

export function formatRecruitTicketUsableUntil(usableUntil: UtcIsoString, timeZone: string, now: UtcIsoString): string {
  return `${formatDate(usableUntil, timeZone, now, false)}까지`;
}

export function formatRecruitTicketTargetsNotice(at: UtcIsoString, timeZone: string, now: UtcIsoString): string {
  return `${formatDate(at, timeZone, now, true)} 이후에는 대상 학생이 바뀔 수 있어요.`;
}
