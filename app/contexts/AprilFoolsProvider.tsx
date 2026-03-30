import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const APRIL_FOOLS_STORAGE_KEY = "aprilFools-2026";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type AprilFoolsContextType = {
  isAprilFoolsDay: boolean;
  enabled: boolean;
  isActive: boolean;
  toggle: () => void;
};

const AprilFoolsContext = createContext<AprilFoolsContextType>({
  isAprilFoolsDay: false,
  enabled: false,
  isActive: false,
  toggle: () => {},
});

export function isAprilFoolsDayInKst(now: Date = new Date()) {
  const kstDate = new Date(now.getTime() + KST_OFFSET_MS);
  return kstDate.getUTCMonth() === 3 && kstDate.getUTCDate() === 1;
}

export function parseAprilFoolsEnabled(storedValue: string | null) {
  return storedValue !== "false";
}

export function getAprilFoolsStudentUid(originalUid: string) {
  const index = Number.parseInt(originalUid, 10) % 4;
  if (index === 0) {
    return "10063_02";
  } else if (index === 1) {
    return "10063_04";
  } else {
    return "10063_01";
  }
}

export function useAprilFools() {
  return useContext(AprilFoolsContext);
}

export function AprilFoolsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  const [isStorageInitialized, setIsStorageInitialized] = useState(false);
  const isAprilFoolsDay = isAprilFoolsDayInKst();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedValue = window.localStorage.getItem(APRIL_FOOLS_STORAGE_KEY);
    setEnabled(parseAprilFoolsEnabled(storedValue));
    setIsStorageInitialized(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isStorageInitialized) {
      return;
    }

    window.localStorage.setItem(APRIL_FOOLS_STORAGE_KEY, String(enabled));
  }, [enabled, isStorageInitialized]);

  const isActive = isAprilFoolsDay && enabled;
  const toggle = () => {
    setEnabled((prev) => !prev);
  };

  return (
    <AprilFoolsContext.Provider value={{ isAprilFoolsDay, enabled, isActive, toggle }}>
      {children}
    </AprilFoolsContext.Provider>
  );
}
