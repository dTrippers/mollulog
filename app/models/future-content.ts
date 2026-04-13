import type { FutureContent } from "./content";

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (value == null) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

export function normalizeFutureContentDates(content: FutureContent): FutureContent {
  return {
    ...content,
    startAt: normalizeDate(content.startAt) ?? new Date(content.startAt),
    endAt: normalizeDate(content.endAt),
    syncedAt: normalizeDate(content.syncedAt),
    recruitments: content.recruitments.map((recruitment) => ({
      ...recruitment,
      since: normalizeDate(recruitment.since) ?? new Date(recruitment.since),
      until: normalizeDate(recruitment.until),
    })),
  };
}
