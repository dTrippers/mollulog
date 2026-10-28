// Pages scroll inside `.mllg-content-area`, not the window, so React Router's <ScrollRestoration> cannot restore them.
// Root saves the offset of each history entry here and restores it on a back/forward navigation. Storage is per tab
// session and only affects scroll position, never data.
const CONTENT_SCROLL_STATE_KEY = "mllg:content-scroll-positions";
const MAX_CONTENT_SCROLL_ENTRIES = 50;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type ContentScrollEntry = { entryKey: string; scrollTop: number };

function isContentScrollEntry(value: unknown): value is ContentScrollEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  return (
    "entryKey" in value &&
    typeof value.entryKey === "string" &&
    "scrollTop" in value &&
    typeof value.scrollTop === "number" &&
    Number.isFinite(value.scrollTop) &&
    value.scrollTop >= 0
  );
}

function readEntries(storage: StorageLike | null): ContentScrollEntry[] {
  if (!storage) {
    return [];
  }

  try {
    const saved = storage.getItem(CONTENT_SCROLL_STATE_KEY);
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.filter(isContentScrollEntry) : [];
  } catch {
    return [];
  }
}

// React Router keys every entry it did not create, such as the landing page of a visit, as "default". The path tells those
// entries apart, so a back navigation to the landing page still finds its offset.
export function getContentScrollEntryKey(location: { key: string; pathname: string; search: string }): string {
  return location.key === "default" ? `default:${location.pathname}${location.search}` : location.key;
}

export function readContentScrollPosition(storage: StorageLike | null, entryKey: string): number | null {
  if (!entryKey) {
    return null;
  }
  return readEntries(storage).find((entry) => entry.entryKey === entryKey)?.scrollTop ?? null;
}

export function saveContentScrollPosition(storage: StorageLike | null, entryKey: string, scrollTop: number): void {
  if (!storage || !entryKey || !Number.isFinite(scrollTop) || scrollTop < 0) {
    return;
  }

  try {
    const next = [
      ...readEntries(storage).filter((entry) => entry.entryKey !== entryKey),
      { entryKey, scrollTop: Math.round(scrollTop) },
    ].slice(-MAX_CONTENT_SCROLL_ENTRIES);
    storage.setItem(CONTENT_SCROLL_STATE_KEY, JSON.stringify(next));
  } catch {
    // A blocked or unavailable session store must not prevent navigation.
  }
}

export function getContentScrollContainer(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.querySelector<HTMLElement>(".mllg-content-area");
}
