import { getBrowserStorage } from "../futures._components/futures-navigation";

// The list scrolls inside `.mllg-content-area`, not the window. A back navigation to the list returns to the saved offset
// of that history entry. Storage is per tab session and only affects scroll position, never data.
export const newsScrollStateKey = "news::scroll-position";
const MAX_NEWS_SCROLL_ENTRIES = 16;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type NavigationType = "POP" | "PUSH" | "REPLACE";

type NewsScrollEntry = { entryKey: string; scrollTop: number };

function isNewsScrollEntry(value: unknown): value is NewsScrollEntry {
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

function readEntries(storage: StorageLike | null): NewsScrollEntry[] {
  if (!storage) {
    return [];
  }

  try {
    const saved = storage.getItem(newsScrollStateKey);
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.filter(isNewsScrollEntry) : [];
  } catch {
    return [];
  }
}

export function readNewsScrollPosition(storage: StorageLike | null, entryKey: string): number | null {
  if (!entryKey) {
    return null;
  }
  return readEntries(storage).find((entry) => entry.entryKey === entryKey)?.scrollTop ?? null;
}

export function saveNewsScrollPosition(storage: StorageLike | null, entryKey: string, scrollTop: number): void {
  if (!storage || !entryKey || !Number.isFinite(scrollTop) || scrollTop < 0) {
    return;
  }

  try {
    const next = [
      ...readEntries(storage).filter((entry) => entry.entryKey !== entryKey),
      { entryKey, scrollTop: Math.round(scrollTop) },
    ].slice(-MAX_NEWS_SCROLL_ENTRIES);
    storage.setItem(newsScrollStateKey, JSON.stringify(next));
  } catch {
    // A blocked or unavailable session store must not prevent navigation.
  }
}

// Root uses this to keep the scroll offset for a back navigation that the news list will restore itself.
export function shouldKeepNewsScrollOnNavigation({
  pathname,
  navigationType,
  entryKey,
  storage,
}: {
  pathname: string;
  navigationType: NavigationType;
  entryKey: string;
  storage: StorageLike | null;
}): boolean {
  // The router serves `/news/` as the list too, so one trailing slash is the same list.
  const listPath = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return navigationType === "POP" && listPath === "/news" && readNewsScrollPosition(storage, entryKey) !== null;
}

export function getNewsScrollContainer(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.querySelector<HTMLElement>(".mllg-content-area");
}

export function getNewsSessionStorage(): StorageLike | null {
  return getBrowserStorage("sessionStorage");
}
