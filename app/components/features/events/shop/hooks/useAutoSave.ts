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
 * Auto-save hook that periodically saves shop state changes to the server.
 * Handles synchronization and prevents unnecessary saves.
 */
export function useAutoSave({ state, signedIn, shopStateUid, savedShopState }: UseAutoSaveParams) {
  const fetcher = useFetcher();
  const saveIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  // Save baseline: the server-loaded state, or the state at mount when the
  // server has none, so the untouched default state is never saved.
  const lastSavedStateRef = useRef<EventShopState | null>(getInitialLastSavedState(savedShopState, state));

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
      if (hasChanged && fetcher.state === "idle") {
        lastSavedStateRef.current = currentState;
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

  const isSaving = fetcher.state === "submitting" || fetcher.state === "loading";
  return { isSaving };
}
