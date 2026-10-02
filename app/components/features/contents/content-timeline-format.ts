import { formatInstant, formatInstantDateKey } from "~/lib/date-time";

export function formatOfflineEventSchedule(
  startAt: string,
  endAt: string | null,
  timeZone: string | null | undefined,
): string {
  const startLabel = formatInstant(startAt, { timeZone, format: "M/D HH:mm" });
  if (!endAt) return startLabel;

  const sameDate = formatInstantDateKey(startAt, timeZone) === formatInstantDateKey(endAt, timeZone);
  const endLabel = formatInstant(endAt, { timeZone, format: sameDate ? "HH:mm" : "M/D HH:mm" });
  return `${startLabel}–${endLabel}`;
}
