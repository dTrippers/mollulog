import { difficultyLocale } from "~/locales/ko";

// Shared with the pointer math in RaidScoreHistogram, which must match the rendered plot area.
export const CHART_MARGIN_RIGHT = 4;

export function formatTimeLabel(totalSeconds: number): string {
  const minute = Math.floor(totalSeconds / 60);
  const second = totalSeconds % 60;
  return `${minute.toString().padStart(2, "0")}:${second.toString().padStart(2, "0")}`;
}

export function formatDifficulty(difficulty: string): string {
  return difficultyLocale[difficulty as keyof typeof difficultyLocale] ?? difficulty;
}
