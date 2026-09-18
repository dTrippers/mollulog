import { useEffect, useMemo, useRef, useState } from "react";
import type { BonusStudentSelectionMode, MinigamePaymentQuantityMode, ShopResource, Stage } from "~/domain/event-shop";
import type { EventShopState } from "~/models/event-shop-state";
import { isDailyResetShopResource } from "../calculations/shop-costs";

export type ShopState = {
  itemQuantities: Record<string, number>;
  itemPurchaseDays: Record<string, number>;
  selectedBonusStudentUids: string[];
  bonusStudentSelectionMode: BonusStudentSelectionMode;
  selectedBonusStudentUidsByItem: Record<string, string[]>;
  includeRecruitedStudents: boolean;
  enabledStages: Record<string, boolean>;
  existingPaymentItemQuantities: Record<string, number>;
  includeFirstClear: boolean;
  extraStageRuns: Record<string, number>;
  minigameStartRound: number;
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
  setBonusStudentSelectionMode: (mode: BonusStudentSelectionMode, itemUids: string[]) => void;
  toggleBonusStudentForItem: (itemUid: string, studentUid: string) => void;
  setBonusStudentForItems: (itemUids: string[], studentUid: string, selected: boolean) => void;
  setBonusStudentsForItems: (itemUids: string[], studentUids: string[]) => void;
  setIncludeRecruitedStudents: (value: boolean) => void;
  toggleStage: (uid: string, enabled: boolean) => void;
  updateExtraRuns: (uid: string, value: number) => void;
  setIncludeFirstClear: (value: boolean) => void;
  setMinigameStartRound: (round: number) => void;
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
  signedIn: boolean;
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

export function getInitialMinigameStartRound(savedShopState: EventShopState | null): number {
  return Math.max(1, savedShopState?.minigameStartRound ?? 1);
}

/**
 * Serializes the live shop state into the persisted shape with a fixed field
 * order so auto-save comparisons stay consistent across baseline and periodic saves.
 */
export function toEventShopState(state: ShopState): EventShopState {
  return {
    itemQuantities: state.itemQuantities,
    itemPurchaseDays: state.itemPurchaseDays,
    selectedBonusStudentUids: state.selectedBonusStudentUids,
    bonusStudentSelectionMode: state.bonusStudentSelectionMode,
    selectedBonusStudentUidsByItem: state.selectedBonusStudentUidsByItem,
    enabledStages: state.enabledStages,
    includeRecruitedStudents: state.includeRecruitedStudents,
    existingPaymentItemQuantities: state.existingPaymentItemQuantities,
    includeFirstClear: state.includeFirstClear,
    extraStageRuns: state.extraStageRuns,
    minigameStartRound: state.minigameStartRound,
    minigamePlayCount: state.minigamePlayCount,
    minigamePaymentQuantityMode: state.minigamePaymentQuantityMode,
    overriddenRequiredQuantities: state.overriddenRequiredQuantities,
  };
}

/**
 * Save baseline for auto-save: the server-loaded state when one exists,
 * otherwise a snapshot of the state at mount so the untouched default state
 * is never saved.
 */
export function getInitialLastSavedState(
  savedShopState: EventShopState | null,
  state: ShopState,
): EventShopState | null {
  return savedShopState ?? toEventShopState(state);
}

/**
 * State to apply when user context arrives on a page that was mounted while
 * signed out. useState initializers run only at mount, so after a client-side
 * sign-in (e.g., passkey from the sign-in sheet) revalidates the loader, the
 * live state would keep guest defaults — an empty recruited-student selection
 * among them — and the next save would persist them. When a saved state
 * exists it is authoritative and replaces any edits made while signed out;
 * otherwise only the recruited-student defaults change. Returns null when
 * there is no user context to apply yet.
 */
export function getPostSignInState({
  savedShopState,
  recruitedStudentUids,
  shopResources,
  stages,
}: Pick<UseShopStateParams, "savedShopState" | "recruitedStudentUids" | "shopResources" | "stages">): ShopState | null {
  if (!savedShopState && recruitedStudentUids.length === 0) {
    return null;
  }

  return {
    itemQuantities: savedShopState?.itemQuantities ?? {},
    itemPurchaseDays: getInitialItemPurchaseDays(savedShopState, shopResources),
    selectedBonusStudentUids: savedShopState?.selectedBonusStudentUids ?? recruitedStudentUids,
    bonusStudentSelectionMode: savedShopState?.bonusStudentSelectionMode ?? "shared",
    selectedBonusStudentUidsByItem: savedShopState?.selectedBonusStudentUidsByItem ?? {},
    includeRecruitedStudents: savedShopState?.includeRecruitedStudents ?? true,
    enabledStages: savedShopState?.enabledStages ?? getDefaultEnabledStages(stages),
    existingPaymentItemQuantities: savedShopState?.existingPaymentItemQuantities ?? {},
    includeFirstClear: savedShopState?.includeFirstClear ?? false,
    extraStageRuns: savedShopState?.extraStageRuns ?? {},
    minigameStartRound: getInitialMinigameStartRound(savedShopState),
    minigamePlayCount: savedShopState?.minigamePlayCount ?? 0,
    minigamePaymentQuantityMode: savedShopState?.minigamePaymentQuantityMode ?? "expected",
    overriddenRequiredQuantities: savedShopState?.overriddenRequiredQuantities ?? {},
  };
}

/**
 * Unified state management hook for event shop page.
 */
export function useShopState({
  savedShopState,
  recruitedStudentUids,
  shopResources,
  stages,
  signedIn,
}: UseShopStateParams) {
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>(savedShopState?.itemQuantities ?? {});
  const [itemPurchaseDays, setItemPurchaseDays] = useState<Record<string, number>>(
    getInitialItemPurchaseDays(savedShopState, shopResources),
  );
  const [selectedBonusStudentUids, setSelectedBonusStudentUids] = useState<string[]>(
    savedShopState?.selectedBonusStudentUids ?? recruitedStudentUids,
  );
  const [bonusStudentSelectionMode, setBonusStudentSelectionMode] = useState<BonusStudentSelectionMode>(
    savedShopState?.bonusStudentSelectionMode ?? "shared",
  );
  const [selectedBonusStudentUidsByItem, setSelectedBonusStudentUidsByItem] = useState<Record<string, string[]>>(
    savedShopState?.selectedBonusStudentUidsByItem ?? {},
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
  const [minigameStartRound, setMinigameStartRound] = useState<number>(getInitialMinigameStartRound(savedShopState));
  const [minigamePlayCount, setMinigamePlayCount] = useState<number>(savedShopState?.minigamePlayCount ?? 0);
  const [minigamePaymentQuantityMode, setMinigamePaymentQuantityMode] = useState<MinigamePaymentQuantityMode>(
    savedShopState?.minigamePaymentQuantityMode ?? "expected",
  );

  const [overriddenRequiredQuantities, setOverriddenRequiredQuantities] = useState<Record<string, number>>(
    savedShopState?.overriddenRequiredQuantities ?? {},
  );

  // A page mounted while signed out keeps guest defaults even after a
  // client-side sign-in revalidates the loader, so apply the user context
  // (saved state or recruited-student defaults) once, when it arrives. The
  // next periodic save then persists the synced state instead of guest
  // defaults such as the empty recruited-student selection.
  const didSyncSignedInStateRef = useRef(signedIn);
  useEffect(() => {
    if (didSyncSignedInStateRef.current || !signedIn) {
      return;
    }
    const syncedState = getPostSignInState({ savedShopState, recruitedStudentUids, shopResources, stages });
    if (!syncedState) {
      return;
    }
    didSyncSignedInStateRef.current = true;
    setItemQuantities(syncedState.itemQuantities);
    setItemPurchaseDays(syncedState.itemPurchaseDays);
    setSelectedBonusStudentUids(syncedState.selectedBonusStudentUids);
    setBonusStudentSelectionMode(syncedState.bonusStudentSelectionMode);
    setSelectedBonusStudentUidsByItem(syncedState.selectedBonusStudentUidsByItem);
    setIncludeRecruitedStudents(syncedState.includeRecruitedStudents);
    setEnabledStages(syncedState.enabledStages);
    setExistingPaymentItemQuantities(syncedState.existingPaymentItemQuantities);
    setIncludeFirstClear(syncedState.includeFirstClear);
    setExtraStageRuns(syncedState.extraStageRuns);
    setMinigameStartRound(syncedState.minigameStartRound);
    setMinigamePlayCount(syncedState.minigamePlayCount);
    setMinigamePaymentQuantityMode(syncedState.minigamePaymentQuantityMode);
    setOverriddenRequiredQuantities(syncedState.overriddenRequiredQuantities);
  }, [signedIn, savedShopState, recruitedStudentUids, shopResources, stages]);

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

      setBonusStudentSelectionMode: (mode: BonusStudentSelectionMode, itemUids: string[]) => {
        if (mode === "perItem") {
          setSelectedBonusStudentUidsByItem((prev) => {
            const next = { ...prev };
            for (const itemUid of itemUids) {
              if (next[itemUid] === undefined) {
                next[itemUid] = [...selectedBonusStudentUids];
              }
            }
            return next;
          });
        }
        setBonusStudentSelectionMode(mode);
      },

      toggleBonusStudentForItem: (itemUid: string, studentUid: string) => {
        setSelectedBonusStudentUidsByItem((prev) => {
          const selectedStudentUids = prev[itemUid] ?? selectedBonusStudentUids;
          const nextStudentUids = selectedStudentUids.includes(studentUid)
            ? selectedStudentUids.filter((uid) => uid !== studentUid)
            : [...selectedStudentUids, studentUid];
          return { ...prev, [itemUid]: nextStudentUids };
        });
      },

      setBonusStudentForItems: (itemUids: string[], studentUid: string, selected: boolean) => {
        setSelectedBonusStudentUidsByItem((prev) => {
          const next = { ...prev };
          for (const itemUid of itemUids) {
            const selectedStudentUids = next[itemUid] ?? selectedBonusStudentUids;
            next[itemUid] = selected
              ? [...new Set([...selectedStudentUids, studentUid])]
              : selectedStudentUids.filter((uid) => uid !== studentUid);
          }
          return next;
        });
      },

      setBonusStudentsForItems: (itemUids: string[], studentUids: string[]) => {
        setSelectedBonusStudentUidsByItem((prev) => {
          const next = { ...prev };
          for (const itemUid of itemUids) {
            next[itemUid] = [...studentUids];
          }
          return next;
        });
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

      setMinigameStartRound: (round: number) => {
        setMinigameStartRound(Math.max(1, Math.floor(round)));
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
    [selectedBonusStudentUids],
  );

  const state: ShopState = {
    itemQuantities,
    itemPurchaseDays,
    selectedBonusStudentUids,
    bonusStudentSelectionMode,
    selectedBonusStudentUidsByItem,
    includeRecruitedStudents,
    enabledStages,
    existingPaymentItemQuantities,
    includeFirstClear,
    extraStageRuns,
    minigameStartRound,
    minigamePlayCount,
    minigamePaymentQuantityMode,
    overriddenRequiredQuantities,
  };

  return { state, actions };
}
