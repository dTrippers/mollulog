import { useState, useMemo } from "react";
import type { EventShopState } from "~/models/event-shop-state";
import type { Stage } from "../types";

export type ShopState = {
  itemQuantities: Record<string, number>;
  selectedBonusStudentUids: string[];
  includeRecruitedStudents: boolean;
  enabledStages: Record<string, boolean>;
  existingPaymentItemQuantities: Record<string, number>;
  includeFirstClear: boolean;
  extraStageRuns: Record<string, number>;
  minigamePlayCount: number;
  overriddenRequiredQuantities: Record<string, number>;
};

export type ShopActions = {
  updateItemQuantity: (uid: string, value: number) => void;
  updateItemQuantities: (
    updater: (prev: Record<string, number>) => Record<string, number>,
  ) => void;
  toggleBonusStudent: (uid: string) => void;
  setBonusStudents: (uids: string[]) => void;
  setIncludeRecruitedStudents: (value: boolean) => void;
  toggleStage: (uid: string, enabled: boolean) => void;
  updateExtraRuns: (uid: string, value: number) => void;
  setIncludeFirstClear: (value: boolean) => void;
  setMinigamePlayCount: (count: number) => void;
  updateExistingQuantity: (uid: string, value: number) => void;
  updateOverriddenRequired: (uid: string, value: number) => void;
  resetOverriddenRequired: (uid: string) => void;
};

type UseShopStateParams = {
  savedShopState: EventShopState | null;
  recruitedStudentUids: string[];
  stages: Stage[];
};

/**
 * Unified state management hook for event shop page.
 */
export function useShopState({
  savedShopState,
  recruitedStudentUids,
  stages,
}: UseShopStateParams) {
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>(savedShopState?.itemQuantities ?? {});
  const [selectedBonusStudentUids, setSelectedBonusStudentUids] = useState<string[]>(savedShopState?.selectedBonusStudentUids ?? recruitedStudentUids);
  const [includeRecruitedStudents, setIncludeRecruitedStudents] = useState<boolean>(savedShopState?.includeRecruitedStudents ?? true);

  const [enabledStages, setEnabledStages] = useState<Record<string, boolean>>(
    savedShopState?.enabledStages ?? stages.reduce((acc, stage) => ({
      ...acc,
      [stage.uid]: Number.parseInt(stage.index) >= 9,
    }), {}),
  );

  const [existingPaymentItemQuantities, setExistingPaymentItemQuantities] =
    useState<Record<string, number>>(savedShopState?.existingPaymentItemQuantities ?? {});

  const [includeFirstClear, setIncludeFirstClear] = useState<boolean>(savedShopState?.includeFirstClear ?? false);
  const [extraStageRuns, setExtraStageRuns] = useState<Record<string, number>>(savedShopState?.extraStageRuns ?? {});
  const [minigamePlayCount, setMinigamePlayCount] = useState<number>(savedShopState?.minigamePlayCount ?? 0);

  const [overriddenRequiredQuantities, setOverriddenRequiredQuantities] = useState<Record<string, number>>(savedShopState?.overriddenRequiredQuantities ?? {});

  // Actions object with memoized callbacks
  const actions = useMemo<ShopActions>(() => ({
    updateItemQuantity: (uid: string, value: number) => {
      setItemQuantities((prev) => ({ ...prev, [uid]: value }));
    },

    updateItemQuantities: (updater: (prev: Record<string, number>) => Record<string, number>) => {
      setItemQuantities(updater);
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
  }), []);

  const state: ShopState = {
    itemQuantities,
    selectedBonusStudentUids,
    includeRecruitedStudents,
    enabledStages,
    existingPaymentItemQuantities,
    includeFirstClear,
    extraStageRuns,
    minigamePlayCount,
    overriddenRequiredQuantities,
  };

  return { state, actions };
}
