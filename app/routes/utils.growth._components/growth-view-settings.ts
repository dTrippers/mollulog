import { useCallback, useEffect, useState } from "react";
import { type GrowthSortOrder, isGrowthSortOrder } from "~/domain/growth-planner";

const GROWTH_VIEW_SETTINGS_STORAGE_KEY = "mollulog::growth::view-settings";

// Per-device view settings. The sort choice is stored per account (planner state); this object held it before, and
// a value left here is read once so the account can take it over.
export type GrowthViewSettings = {
  showNumberInputShortcuts: boolean;
};

// A device with nothing stored starts without the step buttons. A device that opened the 1.x planner keeps the value it
// stored, so existing users see no change.
export const DEFAULT_GROWTH_VIEW_SETTINGS: GrowthViewSettings = {
  showNumberInputShortcuts: false,
};

export function normalizeGrowthViewSettings(value: unknown): GrowthViewSettings {
  if (!value || typeof value !== "object") {
    return DEFAULT_GROWTH_VIEW_SETTINGS;
  }

  const settings = value as Partial<Record<keyof GrowthViewSettings, unknown>>;
  return {
    showNumberInputShortcuts:
      typeof settings.showNumberInputShortcuts === "boolean"
        ? settings.showNumberInputShortcuts
        : DEFAULT_GROWTH_VIEW_SETTINGS.showNumberInputShortcuts,
  };
}

/**
 * The sort choice this device stored before it moved to the account, or null. The 1.x planner wrote its default
 * (플래너 등록 최신순) on every visit, so that value does not show a choice and is not carried over; 수동 정렬 starts in
 * the same order.
 */
export function readLegacyGrowthSortOrder(value: unknown): GrowthSortOrder | null {
  if (!value || typeof value !== "object") return null;
  const sortOrder = (value as { sortOrder?: unknown }).sortOrder;
  return isGrowthSortOrder(sortOrder) && sortOrder !== "manual" && sortOrder !== "planner-newest" ? sortOrder : null;
}

function readStoredValue(): unknown {
  try {
    const saved = localStorage.getItem(GROWTH_VIEW_SETTINGS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

// The third value is the legacy sort choice: undefined until the stored settings are read, then the choice or null.
// The stored choice stays on the device until `dropLegacySortOrder` is called, after the account has taken it over, so
// a failed takeover is tried again on the next visit.
export function useGrowthViewSettings() {
  const [settings, setSettings] = useState<GrowthViewSettings>(DEFAULT_GROWTH_VIEW_SETTINGS);
  const [legacySortOrder, setLegacySortOrder] = useState<GrowthSortOrder | null | undefined>(undefined);
  const [keptSortOrder, setKeptSortOrder] = useState<GrowthSortOrder | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredValue();
    const legacy = readLegacyGrowthSortOrder(stored);
    setSettings(normalizeGrowthViewSettings(stored));
    setLegacySortOrder(legacy);
    setKeptSortOrder(legacy);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      localStorage.setItem(
        GROWTH_VIEW_SETTINGS_STORAGE_KEY,
        JSON.stringify(keptSortOrder ? { ...settings, sortOrder: keptSortOrder } : settings),
      );
    } catch {
      // Keep the planner usable when browser storage is unavailable.
    }
  }, [hydrated, settings, keptSortOrder]);

  const dropLegacySortOrder = useCallback(() => setKeptSortOrder(null), []);

  return [settings, setSettings, legacySortOrder, dropLegacySortOrder] as const;
}
