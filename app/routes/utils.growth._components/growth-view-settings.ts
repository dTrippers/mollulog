import { useEffect, useState } from "react";
import { type GrowthSortOrder, isGrowthSortOrder } from "./growth-sort";

const GROWTH_VIEW_SETTINGS_STORAGE_KEY = "mollulog::growth::view-settings";

export type GrowthViewSettings = {
  sortOrder: GrowthSortOrder;
  showNumberInputShortcuts: boolean;
};

export const DEFAULT_GROWTH_VIEW_SETTINGS: GrowthViewSettings = {
  sortOrder: "planner-newest",
  showNumberInputShortcuts: true,
};

export function normalizeGrowthViewSettings(value: unknown): GrowthViewSettings {
  if (!value || typeof value !== "object") {
    return DEFAULT_GROWTH_VIEW_SETTINGS;
  }

  const settings = value as Partial<Record<keyof GrowthViewSettings, unknown>>;
  return {
    sortOrder: isGrowthSortOrder(settings.sortOrder) ? settings.sortOrder : DEFAULT_GROWTH_VIEW_SETTINGS.sortOrder,
    showNumberInputShortcuts:
      typeof settings.showNumberInputShortcuts === "boolean"
        ? settings.showNumberInputShortcuts
        : DEFAULT_GROWTH_VIEW_SETTINGS.showNumberInputShortcuts,
  };
}

function readStoredGrowthViewSettings(): GrowthViewSettings {
  try {
    const saved = localStorage.getItem(GROWTH_VIEW_SETTINGS_STORAGE_KEY);
    return saved ? normalizeGrowthViewSettings(JSON.parse(saved)) : DEFAULT_GROWTH_VIEW_SETTINGS;
  } catch {
    return DEFAULT_GROWTH_VIEW_SETTINGS;
  }
}

export function useGrowthViewSettings() {
  const [settings, setSettings] = useState<GrowthViewSettings>(DEFAULT_GROWTH_VIEW_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(readStoredGrowthViewSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      localStorage.setItem(GROWTH_VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Keep the planner usable when browser storage is unavailable.
    }
  }, [hydrated, settings]);

  return [settings, setSettings] as const;
}
