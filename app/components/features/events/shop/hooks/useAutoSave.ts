import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import type { EventShopState } from "~/models/event-shop-state";
import type { ShopState } from "./useShopState";

type UseAutoSaveParams = {
  state: ShopState;
  signedIn: boolean;
  eventUid: string;
  savedShopState: EventShopState | null;
  isInitialLoad: boolean;
};

/**
 * Auto-save hook that periodically saves shop state changes to the server.
 * Handles synchronization and prevents unnecessary saves.
 */
export function useAutoSave({ state, signedIn, eventUid, savedShopState, isInitialLoad }: UseAutoSaveParams) {
  const fetcher = useFetcher();
  const saveIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastSavedStateRef = useRef<EventShopState | null>(null);

  // Initialize lastSavedStateRef with the initial saved state
  useEffect(() => {
    if (savedShopState && lastSavedStateRef.current === null) {
      lastSavedStateRef.current = savedShopState;
    }
  }, [savedShopState]);

  // Prevent re-render from revalidation
  const prevSavedShopStateRef = useRef(savedShopState);
  useEffect(() => {
    if (savedShopState && savedShopState !== prevSavedShopStateRef.current) {
      prevSavedShopStateRef.current = savedShopState;

      if (lastSavedStateRef.current === null) {
        lastSavedStateRef.current = savedShopState;
      } else {
        const stateMatches = JSON.stringify(lastSavedStateRef.current) === JSON.stringify(savedShopState);
        if (stateMatches) {
          lastSavedStateRef.current = savedShopState;
        }
      }
    } else if (!savedShopState) {
      prevSavedShopStateRef.current = null;
      lastSavedStateRef.current = null;
    }
  }, [savedShopState]);

  // Periodic save check: every 1.5 seconds
  useEffect(() => {
    if (!signedIn || isInitialLoad) {
      return;
    }

    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current);
    }

    saveIntervalRef.current = setInterval(() => {
      const currentState: EventShopState = {
        itemQuantities: state.itemQuantities,
        itemPurchaseDays: state.itemPurchaseDays,
        selectedBonusStudentUids: state.selectedBonusStudentUids,
        enabledStages: state.enabledStages,
        includeRecruitedStudents: state.includeRecruitedStudents,
        existingPaymentItemQuantities: state.existingPaymentItemQuantities,
        includeFirstClear: state.includeFirstClear,
        extraStageRuns: state.extraStageRuns,
        minigamePlayCount: state.minigamePlayCount,
        minigamePaymentQuantityMode: state.minigamePaymentQuantityMode,
        overriddenRequiredQuantities: state.overriddenRequiredQuantities,
      };

      const hasChanged =
        lastSavedStateRef.current === null ||
        JSON.stringify(lastSavedStateRef.current) !== JSON.stringify(currentState);
      if (hasChanged && fetcher.state === "idle") {
        lastSavedStateRef.current = currentState;
        fetcher.submit(
          { save: currentState },
          {
            method: "post",
            action: `/api/events/${eventUid}/shop-state`,
            encType: "application/json",
          },
        );
      }
    }, 1500);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, [state, signedIn, eventUid, fetcher, isInitialLoad]);

  const isSaving = fetcher.state === "submitting" || fetcher.state === "loading";
  return { isSaving };
}
