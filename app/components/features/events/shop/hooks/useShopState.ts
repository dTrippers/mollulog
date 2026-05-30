import { useMemo, useState } from "react";
import type { EventShopState } from "~/models/event-shop-state";
import { isDailyResetShopResource } from "../calculations/shop-costs";
import type { MinigamePaymentQuantityMode } from "../constants";
import type { ShopResource, Stage } from "../types";

export type ShopState = {
  itemQuantities: Record<string, number>;
  itemPurchaseDays: Record<string, number>;
  selectedBonusStudentUids: string[];
  includeRecruitedStudents: boolean;
  enabledStages: Record<string, boolean>;
  existingPaymentItemQuantities: Record<string, number>;
  includeFirstClear: boolean;
  extraStageRuns: Record<string, number>;
  minigamePlayCount: number;
  minigamePaymentQuantityMode: MinigamePaymentQuantityMode;
  overriddenRequiredQuantities: Record<string, number>;
};

export type ShopActions = {
  updateItemQuantity: (uid: string, value: number) => void;
  updateItemQuantities: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
  updateItemPurchaseDay: (uid: string, value: number) => void;
  updateItemPurchaseDays: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
  toggleBonusStudent: (uid: string) => void;
  setBonusStudents: (uids: string[]) => void;
  setIncludeRecruitedStudents: (value: boolean) => void;
  toggleStage: (uid: string, enabled: boolean) => void;
  updateExtraRuns: (uid: string, value: number) => void;
  setIncludeFirstClear: (value: boolean) => void;
  setMinigamePlayCount: (count: number) => void;
  setMinigamePaymentQuantityMode: (mode: MinigamePaymentQuantityMode) => void;
  updateExistingQuantity: (uid: string, value: number) => void;
  updateOverriddenRequired: (uid: string, value: number) => void;
  resetOverriddenRequired: (uid: string) => void;
};

type UseShopStateParams = {
  savedShopState: EventShopState | null;
  recruitedStudentUids: string[];
  shopResources: ShopResource[];
  stages: Stage[];
};

function getDefaultEnabledStages(stages: Stage[]) {
  const initialEnabledStages: Record<string, boolean> = {};
  for (const stage of stages) {
    initialEnabledStages[stage.uid] = Number.parseInt(stage.index) >= 9;
  }
  return initialEnabledStages;
}

export function getInitialItemPurchaseDays(
  savedShopState: EventShopState | null,
  shopResources: ShopResource[],
): Record<string, number> {
  if (!savedShopState) {
    return {};
  }

  const itemPurchaseDays = { ...savedShopState.itemPurchaseDays };
  for (const shopResource of shopResources) {
    if (!isDailyResetShopResource(shopResource)) {
      continue;
    }

    const savedQuantity = savedShopState.itemQuantities[shopResource.uid] || 0;
    if (savedQuantity > 0 && itemPurchaseDays[shopResource.uid] === undefined) {
      itemPurchaseDays[shopResource.uid] = 1;
    }
  }

  return itemPurchaseDays;
}

/**
 * Unified state management hook for event shop page.
 */
export function useShopState({ savedShopState, recruitedStudentUids, shopResources, stages }: UseShopStateParams) {
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>(savedShopState?.itemQuantities ?? {});
  const [itemPurchaseDays, setItemPurchaseDays] = useState<Record<string, number>>(
    getInitialItemPurchaseDays(savedShopState, shopResources),
  );
  const [selectedBonusStudentUids, setSelectedBonusStudentUids] = useState<string[]>(
    savedShopState?.selectedBonusStudentUids ?? recruitedStudentUids,
  );
  const [includeRecruitedStudents, setIncludeRecruitedStudents] = useState<boolean>(
    savedShopState?.includeRecruitedStudents ?? true,
  );

  const [enabledStages, setEnabledStages] = useState<Record<string, boolean>>(
    savedShopState?.enabledStages ?? getDefaultEnabledStages(stages),
  );

  const [existingPaymentItemQuantities, setExistingPaymentItemQuantities] = useState<Record<string, number>>(
    savedShopState?.existingPaymentItemQuantities ?? {},
  );

  const [includeFirstClear, setIncludeFirstClear] = useState<boolean>(savedShopState?.includeFirstClear ?? false);
  const [extraStageRuns, setExtraStageRuns] = useState<Record<string, number>>(savedShopState?.extraStageRuns ?? {});
  const [minigamePlayCount, setMinigamePlayCount] = useState<number>(savedShopState?.minigamePlayCount ?? 0);
  const [minigamePaymentQuantityMode, setMinigamePaymentQuantityMode] = useState<MinigamePaymentQuantityMode>(
    savedShopState?.minigamePaymentQuantityMode ?? "expected",
  );

  const [overriddenRequiredQuantities, setOverriddenRequiredQuantities] = useState<Record<string, number>>(
    savedShopState?.overriddenRequiredQuantities ?? {},
  );

  // Actions object with memoized callbacks
  const actions = useMemo<ShopActions>(
    () => ({
      updateItemQuantity: (uid: string, value: number) => {
        setItemQuantities((prev) => ({ ...prev, [uid]: value }));
      },

      updateItemQuantities: (updater: (prev: Record<string, number>) => Record<string, number>) => {
        setItemQuantities(updater);
      },

      updateItemPurchaseDay: (uid: string, value: number) => {
        setItemPurchaseDays((prev) => ({ ...prev, [uid]: value }));
      },

      updateItemPurchaseDays: (updater: (prev: Record<string, number>) => Record<string, number>) => {
        setItemPurchaseDays(updater);
      },

      toggleBonusStudent: (uid: string) => {
        setSelectedBonusStudentUids((prev) => {
          if (prev.includes(uid)) {
            return prev.filter((id) => id !== uid);
          }
          return [...prev, uid];
        });
      },

      setBonusStudents: (uids: string[]) => {
        setSelectedBonusStudentUids(uids);
      },

      setIncludeRecruitedStudents: (value: boolean) => {
        setIncludeRecruitedStudents(value);
      },

      toggleStage: (uid: string, enabled: boolean) => {
        setEnabledStages((prev) => ({ ...prev, [uid]: enabled }));
      },

      updateExtraRuns: (uid: string, value: number) => {
        setExtraStageRuns((prev) => ({ ...prev, [uid]: value }));
      },

      setIncludeFirstClear: (value: boolean) => {
        setIncludeFirstClear(value);
      },

      setMinigamePlayCount: (count: number) => {
        setMinigamePlayCount(count);
      },

      setMinigamePaymentQuantityMode: (mode: MinigamePaymentQuantityMode) => {
        setMinigamePaymentQuantityMode(mode);
      },

      updateExistingQuantity: (uid: string, value: number) => {
        setExistingPaymentItemQuantities((prev) => ({ ...prev, [uid]: value }));
      },

      updateOverriddenRequired: (uid: string, value: number) => {
        setOverriddenRequiredQuantities((prev) => ({ ...prev, [uid]: value }));
      },

      resetOverriddenRequired: (uid: string) => {
        setOverriddenRequiredQuantities((prev) => {
          const newPrev = { ...prev };
          delete newPrev[uid];
          return newPrev;
        });
      },
    }),
    [],
  );

  const state: ShopState = {
    itemQuantities,
    itemPurchaseDays,
    selectedBonusStudentUids,
    includeRecruitedStudents,
    enabledStages,
    existingPaymentItemQuantities,
    includeFirstClear,
    extraStageRuns,
    minigamePlayCount,
    minigamePaymentQuantityMode,
    overriddenRequiredQuantities,
  };

  return { state, actions };
}
