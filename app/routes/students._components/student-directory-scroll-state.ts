import { getBrowserStorage } from "../futures._components/futures-navigation";

export const studentDirectoryScrollStateKey = "students::scroll-position";
const MAX_STUDENT_DIRECTORY_SCROLL_ENTRIES = 16;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type NavigationType = "POP" | "PUSH" | "REPLACE";
type StudentDirectoryScrollEntry = { entryKey: string; scrollTop: number };

function isScrollEntry(value: unknown): value is StudentDirectoryScrollEntry {
  return (
    value !== null &&
    typeof value === "object" &&
    "entryKey" in value &&
    typeof value.entryKey === "string" &&
    "scrollTop" in value &&
    typeof value.scrollTop === "number" &&
    Number.isFinite(value.scrollTop) &&
    value.scrollTop >= 0
  );
}

function readEntries(storage: StorageLike | null): StudentDirectoryScrollEntry[] {
  if (!storage) {
    return [];
  }

  try {
    const saved = storage.getItem(studentDirectoryScrollStateKey);
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.filter(isScrollEntry) : [];
  } catch {
    return [];
  }
}

export function readStudentDirectoryScrollPosition(storage: StorageLike | null, entryKey: string): number | null {
  if (!entryKey) {
    return null;
  }
  return readEntries(storage).find((entry) => entry.entryKey === entryKey)?.scrollTop ?? null;
}

export function saveStudentDirectoryScrollPosition(
  storage: StorageLike | null,
  entryKey: string,
  scrollTop: number,
): void {
  if (!storage || !entryKey || !Number.isFinite(scrollTop) || scrollTop < 0) {
    return;
  }

  try {
    const next = [
      ...readEntries(storage).filter((entry) => entry.entryKey !== entryKey),
      { entryKey, scrollTop: Math.round(scrollTop) },
    ].slice(-MAX_STUDENT_DIRECTORY_SCROLL_ENTRIES);
    storage.setItem(studentDirectoryScrollStateKey, JSON.stringify(next));
  } catch {
    // A blocked or unavailable session store must not prevent navigation.
  }
}

export function shouldKeepStudentDirectoryScrollOnNavigation({
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
  const listPath = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return (
    navigationType === "POP" &&
    listPath === "/students" &&
    readStudentDirectoryScrollPosition(storage, entryKey) !== null
  );
}

export function getStudentDirectoryScrollContainer(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.querySelector<HTMLElement>(".mllg-content-area");
}

export function getStudentDirectorySessionStorage(): StorageLike | null {
  return getBrowserStorage("sessionStorage");
}
