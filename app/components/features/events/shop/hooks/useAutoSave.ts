import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import type { EventShopState } from "~/models/event-shop-state";
import { getInitialLastSavedState, toEventShopState, type ShopState } from "./useShopState";

type UseAutoSaveParams = {
  state: ShopState;
  signedIn: boolean;
  shopStateUid: string;
  savedShopState: EventShopState | null;
};

/**
 * What the save action responds with on a completed submit.
 */
type SaveActionData = {
  success?: boolean;
};

/**
 * Decides whether a completed auto-save submit confirmed a persisted state.
 * A submit may advance the save baseline only after a confirmed success, so a
 * failed save stays dirty and the interval resubmits it on the next tick.
 * After a failed action react-router keeps the PREVIOUS fetcher.data, so an
 * already-acknowledged success payload must never count as a fresh success;
 * only a result with a new identity is trusted.
 */
export function resolveSaveSubmitOutcome({
  fetcherState,
  fetcherData,
  acknowledgedData,
  submittedState,
}: {
  fetcherState: "idle" | "submitting" | "loading";
  fetcherData: unknown;
  acknowledgedData: unknown;
  submittedState: EventShopState | null;
}): { acknowledgedData: unknown; confirmedSavedState: EventShopState | null } {
  if (
    fetcherState !== "idle" ||
    fetcherData === undefined ||
    fetcherData === null ||
    fetcherData === acknowledgedData
  ) {
    return { acknowledgedData, confirmedSavedState: null };
  }

  const success = (fetcherData as SaveActionData).success === true;
  return {
    acknowledgedData: fetcherData,
    confirmedSavedState: success && submittedState ? submittedState : null,
  };
}

/**
 * Auto-save hook that periodically saves shop state changes to the server.
 * Handles synchronization and prevents unnecessary saves.
 */
export function useAutoSave({ state, signedIn, shopStateUid, savedShopState }: UseAutoSaveParams) {
  const fetcher = useFetcher();
  const saveIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  // Save baseline: the server-loaded state, or the state at mount when the
  // server has none, so the untouched default state is never saved.
  const lastSavedStateRef = useRef<EventShopState | null>(getInitialLastSavedState(savedShopState, state));
  // The payload of the most recent submit, promoted to the save baseline only
  // once the save is confirmed successful.
  const submittedStateRef = useRef<EventShopState | null>(null);
  // The fetcher.data identity already accounted for: a failed submit keeps the
  // previous fetcher.data, so a stale success payload must not promote.
  const acknowledgedDataRef = useRef<unknown>(undefined);

  // Prevent re-render from revalidation
  const prevSavedShopStateRef = useRef(savedShopState);
  useEffect(() => {
    if (savedShopState && savedShopState !== prevSavedShopStateRef.current) {
      prevSavedShopStateRef.current = savedShopState;

      const stateMatches = JSON.stringify(lastSavedStateRef.current) === JSON.stringify(savedShopState);
      if (stateMatches) {
        lastSavedStateRef.current = savedShopState;
      }
    }
  }, [savedShopState]);

  // Periodic save check: every 1.5 seconds
  useEffect(() => {
    if (!signedIn) {
      return;
    }

    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current);
    }

    saveIntervalRef.current = setInterval(() => {
      const currentState = toEventShopState(state);

      const hasChanged = JSON.stringify(lastSavedStateRef.current) !== JSON.stringify(currentState);
      // A fresh unacknowledged fetcher.data must be consumed by the promote
      // effect before a new submit may overwrite submittedStateRef, so a
      // confirmed submission is never promoted against the wrong payload.
      if (hasChanged && fetcher.state === "idle" && fetcher.data === acknowledgedDataRef.current) {
        submittedStateRef.current = currentState;
        fetcher.submit(
          { save: currentState },
          {
            method: "post",
            action: `/api/events/${shopStateUid}/shop-state`,
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
  }, [state, signedIn, shopStateUid, fetcher]);

  // Advance the save baseline only after the submit is confirmed successful,
  // so a failed save stays dirty and is resubmitted on the next tick.
  useEffect(() => {
    const { acknowledgedData, confirmedSavedState } = resolveSaveSubmitOutcome({
      fetcherState: fetcher.state,
      fetcherData: fetcher.data,
      acknowledgedData: acknowledgedDataRef.current,
      submittedState: submittedStateRef.current,
    });
    acknowledgedDataRef.current = acknowledgedData;
    if (confirmedSavedState) {
      lastSavedStateRef.current = confirmedSavedState;
    }
  }, [fetcher.state, fetcher.data]);

  const isSaving = fetcher.state === "submitting" || fetcher.state === "loading";
  return { isSaving };
}
