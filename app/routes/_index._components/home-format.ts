import type { HomeTimeChip } from "~/domain/home-portal";

// The text and screen-reader prefix of a time chip. A running item reads "진행 중, N일 남음" to screen readers, so the state
// is never carried by the red dot alone.
export function formatHomeTimeChip(chip: HomeTimeChip): {
  text: string;
  srPrefix: string | null;
  live: boolean;
} {
  switch (chip.kind) {
    case "ongoing-days":
      return { text: `${chip.days}일 남음`, srPrefix: "진행 중, ", live: true };
    case "ongoing-hours":
      return { text: `${chip.hours}시간 남음`, srPrefix: "진행 중, ", live: true };
    case "upcoming-days":
      return { text: `${chip.days}일 후 시작`, srPrefix: "예정, ", live: false };
    case "upcoming-today":
      return { text: "오늘 시작", srPrefix: "예정, ", live: false };
    case "publish":
      return { text: `${chip.monthDay} 공개`, srPrefix: null, live: false };
  }
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// The header's reference date, such as "10/16 (금)", for a day key in the display timezone.
export function formatHomeReferenceDate(dateKey: string): string {
  const weekday = WEEKDAY_LABELS[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
  return `${dateKey.slice(5).replace("-", "/")} (${weekday})`;
}
