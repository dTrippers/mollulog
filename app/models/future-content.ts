import { normalizeInstant } from "~/lib/date-time";
import type { FutureContent } from "./content";

function normalizeInstantValue(value: string | Date | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  return normalizeInstant(value instanceof Date ? value.toISOString() : value);
}

export function normalizeFutureContentDates(content: FutureContent): FutureContent {
  return {
    ...content,
    startAt: normalizeInstantValue(content.startAt) ?? normalizeInstant(content.startAt),
    endAt: normalizeInstantValue(content.endAt),
    syncedAt: normalizeInstantValue(content.syncedAt),
    recruitments: content.recruitments.map((recruitment) => ({
      ...recruitment,
      since: normalizeInstantValue(recruitment.since) ?? normalizeInstant(recruitment.since),
      until: normalizeInstantValue(recruitment.until),
    })),
  };
}
