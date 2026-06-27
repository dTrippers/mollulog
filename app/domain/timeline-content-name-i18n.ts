export const TIMELINE_CONTENT_NAME_LOCALES = ["ko", "ja", "en"] as const;

export type TimelineContentNameLocale = (typeof TIMELINE_CONTENT_NAME_LOCALES)[number];
export type TimelineContentNameI18n = Partial<Record<TimelineContentNameLocale, string>>;

const localeSet = new Set<string>(TIMELINE_CONTENT_NAME_LOCALES);

export function normalizeTimelineContentNames(value: Record<string, unknown>): TimelineContentNameI18n {
  const names: TimelineContentNameI18n = {};

  for (const [locale, rawName] of Object.entries(value)) {
    if (!localeSet.has(locale) || typeof rawName !== "string") continue;

    const name = rawName.trim();
    if (name) {
      names[locale as TimelineContentNameLocale] = name;
    }
  }

  return names;
}

export function parseTimelineContentNames(raw: string | null | undefined): TimelineContentNameI18n {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return normalizeTimelineContentNames(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

export function serializeTimelineContentNames(names: Record<string, unknown>): string {
  return JSON.stringify(normalizeTimelineContentNames(names));
}

export function selectTimelineContentName(names: TimelineContentNameI18n): string | null {
  if (names.ko) return names.ko;

  for (const name of Object.values(names)) {
    if (name) return name;
  }

  return null;
}

export function mergeTimelineContentNames(
  current: TimelineContentNameI18n,
  incoming: Record<string, unknown>,
): TimelineContentNameI18n {
  const normalizedIncoming = normalizeTimelineContentNames(incoming);
  return {
    ...current,
    ...normalizedIncoming,
  };
}
