import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { loadGrowthPlannerData } from "./utils.growth._components/growth-data.server";
import type { GrowthLayoutContext, GrowthStudent } from "./utils.growth._components/types";
import {
  createResourceInventoryFilterState,
  type ResourceInventoryFilterState,
} from "./utils.resources._components/ResourceInventoryFilterPanel";

const FARMING_SETTINGS_STORAGE_KEY = "mollulog::resources::farming-settings";

export type FarmingPlannerSettings = {
  showNormal: boolean;
  showHard: boolean;
  prioritizeHighTier: boolean;
};

const DEFAULT_FARMING_SETTINGS: FarmingPlannerSettings = {
  showNormal: true,
  showHard: false,
  prioritizeHighTier: false,
};

export type ResourcePlannerOutletContext = GrowthLayoutContext & {
  resourceInventoryFilter: ResourceInventoryFilterState;
  setResourceInventoryFilter: Dispatch<SetStateAction<ResourceInventoryFilterState>>;
  setFarmingSettings: Dispatch<SetStateAction<FarmingPlannerSettings>>;
};

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const logger = getLogger(env, context.cloudflare.ctx, { route: "utils.resources.loader" });
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  return loadGrowthPlannerData(env, currentUser.id, { logger });
};

export default function ResourcePlannerLayout() {
  const loaderData = useLoaderData<typeof loader>();

  const [managedStudents, setManagedStudents] = useState(loaderData.managedStudents);
  const [farmingSettings, setFarmingSettings] = useState(DEFAULT_FARMING_SETTINGS);
  const [resourceInventoryFilter, setResourceInventoryFilter] = useState(createResourceInventoryFilterState);
  const [farmingSettingsHydrated, setFarmingSettingsHydrated] = useState(false);
  const managedStudentListKey = loaderData.managedStudents.map((student) => student.uid).join(":");
  const syncedManagedStudentListKeyRef = useRef(managedStudentListKey);

  useEffect(() => {
    setFarmingSettings(readStoredFarmingSettings);
    setFarmingSettingsHydrated(true);
  }, []);

  useEffect(() => {
    if (!farmingSettingsHydrated) return;
    try {
      localStorage.setItem(FARMING_SETTINGS_STORAGE_KEY, JSON.stringify(farmingSettings));
    } catch {
      // Ignore localStorage errors.
    }
  }, [farmingSettings, farmingSettingsHydrated]);

  useEffect(() => {
    if (syncedManagedStudentListKeyRef.current === managedStudentListKey) return;
    syncedManagedStudentListKeyRef.current = managedStudentListKey;
    setManagedStudents(loaderData.managedStudents);
  }, [loaderData.managedStudents, managedStudentListKey]);

  const updateStudent = useCallback((next: GrowthStudent) => {
    setManagedStudents((prev) => {
      const idx = prev.findIndex((s) => s.uid === next.uid);
      if (idx === -1) return prev;
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });
  }, []);

  const contextValue: ResourcePlannerOutletContext = {
    managedStudents,
    availableStudents: loaderData.availableStudents,
    updateStudent,
    resourceInventoryFilter,
    setResourceInventoryFilter,
    setFarmingSettings,
    farmingStageFilter: {
      showNormal: farmingSettings.showNormal,
      showHard: farmingSettings.showHard,
      prioritizeHighTier: farmingSettings.prioritizeHighTier,
    },
  };

  return <Outlet context={contextValue} />;
}

function readStoredFarmingSettings(): FarmingPlannerSettings {
  try {
    const saved = localStorage.getItem(FARMING_SETTINGS_STORAGE_KEY);
    if (!saved) return DEFAULT_FARMING_SETTINGS;
    return normalizeFarmingSettings(JSON.parse(saved));
  } catch {
    return DEFAULT_FARMING_SETTINGS;
  }
}

function normalizeFarmingSettings(value: unknown): FarmingPlannerSettings {
  if (!value || typeof value !== "object") {
    return DEFAULT_FARMING_SETTINGS;
  }

  const settings = value as Partial<Record<keyof FarmingPlannerSettings, unknown>>;
  return {
    showNormal: typeof settings.showNormal === "boolean" ? settings.showNormal : DEFAULT_FARMING_SETTINGS.showNormal,
    showHard: typeof settings.showHard === "boolean" ? settings.showHard : DEFAULT_FARMING_SETTINGS.showHard,
    prioritizeHighTier:
      typeof settings.prioritizeHighTier === "boolean"
        ? settings.prioritizeHighTier
        : DEFAULT_FARMING_SETTINGS.prioritizeHighTier,
  };
}
