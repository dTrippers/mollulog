import { formatRaidClearTime, type RaidRecordRaidType, type RaidRecordServer } from "~/domain/raid-record";
import { formatInstant } from "~/lib/date-time";
import { difficultyLocale } from "~/locales/ko";

export const RAID_RECORD_SERVER_LABEL: Record<RaidRecordServer, string> = { kr: "한국 서버", jp: "일본 서버" };
export const RAID_RECORD_SERVER_SHORT_LABEL: Record<RaidRecordServer, string> = { kr: "한국", jp: "일본" };
export const RAID_RECORD_RAID_TYPE_LABEL: Record<RaidRecordRaidType, string> = {
  total_assault: "총력전",
  elimination: "대결전",
};

export function formatRaidScore(score: number): string {
  return score.toLocaleString("ko-KR");
}

export function formatRaidRank(rank: number): string {
  return `${rank.toLocaleString("ko-KR")}위`;
}

export function formatRaidDifficulty(difficulty: string): string {
  return difficultyLocale[difficulty] ?? difficulty;
}

// "루나틱 · 5:50.125", the difficulty alone when the score does not tell the clear time, or null when the score has no
// computed result.
export function formatRaidClearResult(difficulty: string | null, clearTimeMs: number | null): string | null {
  if (difficulty === null) return null;
  const label = formatRaidDifficulty(difficulty);
  return clearTimeMs === null ? label : `${label} · ${formatRaidClearTime(clearTimeMs)}`;
}

// "2023/08/29 ~ 09/05": the end carries its year only when it differs, as in "2023/12/26 ~ 2024/01/02".
export function formatRaidSeasonPeriod(startAt: string, endAt: string | null, timeZone: string): string {
  const start = formatInstant(startAt, { timeZone, format: "YYYY/MM/DD" });
  if (!endAt) return start;
  const sameYear = formatInstant(startAt, { timeZone, format: "YYYY" }) === formatInstant(endAt, { timeZone, format: "YYYY" });
  return `${start} ~ ${formatInstant(endAt, { timeZone, format: sameYear ? "MM/DD" : "YYYY/MM/DD" })}`;
}

// "11/25 0시"
export function formatRankConfirmAt(confirmAt: string, timeZone: string): string {
  return formatInstant(confirmAt, { timeZone, format: "MM/DD H시" });
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// "11/25(수) 0시"
export function formatRankConfirmAtWithWeekday(confirmAt: string, timeZone: string): string {
  const weekday = WEEKDAYS[Number(formatInstant(confirmAt, { timeZone, format: "d" }))];
  return `${formatInstant(confirmAt, { timeZone, format: "MM/DD" })}(${weekday}) ${formatInstant(confirmAt, { timeZone, format: "H시" })}`;
}

// Digits only, for score and rank inputs that show thousands separators while typing.
export function parseDigits(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function formatDigits(value: number | null): string {
  return value === null ? "" : value.toLocaleString("ko-KR");
}
