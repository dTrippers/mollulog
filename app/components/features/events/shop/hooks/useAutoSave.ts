import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { type EventShopState, eventShopStatesEqual } from "~/domain/event-shop-state";
import type { GuestEventShopPlan } from "~/domain/guest-event-shop-planner";
import { persistGuestEventShopPlanImmediately, readGuestEventShopPlanner } from "~/lib/guest-event-shop-planner.client";
import type { ShopState } from "./useShopState";

export type GuestPlannerStatus = "ready" | "memory" | "conflict" | "corrupt" | "unavailable" | "none";

type UseAutoSaveParams = {
  state: ShopState;
  signedIn: boolean;
  timelineUid: string;
  shopStateUid: string;
  savedShopState: EventShopState | null;
  isInitialLoad: boolean;
  guestPlannerStatus: GuestPlannerStatus;
};

type SaveActionData = {
  success?: boolean;
  error?: string;
  requestId?: string;
};

type AccountSaveResolution =
  | { status: "pending" }
  | { status: "success" }
  | { status: "failure"; error: string }
  | { status: "mismatch"; error: string };

export function resolveAccountSaveResponse({
  fetcherState,
  fetcherData,
  requestId,
}: {
  fetcherState: "idle" | "submitting" | "loading";
  fetcherData: SaveActionData | undefined;
  requestId: string;
}): AccountSaveResolution {
  if (fetcherState !== "idle") return { status: "pending" };
  if (fetcherData?.requestId !== requestId) {
    return {
      status: "mismatch",
      error: "저장 응답을 확인하지 못했어요. 현재 입력은 유지되어 있어요. 다시 시도해주세요.",
    };
  }
  if (fetcherData.success === true) return { status: "success" };
  return {
    status: "failure",
    error: fetcherData.error ?? "상점 계획을 저장하지 못했어요. 다시 시도해주세요.",
  };
}

function toEventShopState(state: ShopState): EventShopState {
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

function guestStorageError(status: GuestPlannerStatus): string {
  switch (status) {
    case "memory":
      return "브라우저 저장 공간을 쓸 수 없어 현재 탭에 임시 보관 중이에요.";
    case "conflict":
      return "다른 탭에서 같은 상점 계획을 수정했어요. 현재 입력은 이 탭에 남아 있지만 아직 저장되지 않았어요.";
    case "corrupt":
      return "저장된 게스트 상점 계획을 읽지 못했어요. 현재 입력은 저장되지 않았어요.";
    case "unavailable":
      return "브라우저 상점 계획 저장소에 접근할 수 없어요. 현재 입력은 저장되지 않았어요.";
    case "ready":
    case "none":
      return "브라우저에 상점 계획을 저장하지 못했어요.";
  }
}

/** Saves guest changes synchronously and account changes only after server acknowledgement. */
export function useAutoSave({
  state,
  signedIn,
  timelineUid,
  shopStateUid,
  savedShopState,
  isInitialLoad,
  guestPlannerStatus,
}: UseAutoSaveParams) {
  const fetcher = useFetcher<SaveActionData>();
  const renderedState = toEventShopState(state);
  const currentStateKey = JSON.stringify(renderedState);
  const currentState = useMemo(() => JSON.parse(currentStateKey) as EventShopState, [currentStateKey]);
  const currentStateRef = useRef(currentState);
  const fetcherStateRef = useRef(fetcher.state);
  const fetcherSubmitRef = useRef(fetcher.submit);
  const lastSavedStateRef = useRef<EventShopState | null>(null);
  const pendingAccountSaveRef = useRef<{ state: EventShopState; requestId: string } | null>(null);
  const accountSaveSequenceRef = useRef(0);
  const accountSaveFailedRef = useRef(false);
  const initialAccountSavePendingRef = useRef(signedIn && savedShopState === null);
  const [saveError, setSaveError] = useState<string | null>(() =>
    !signedIn && guestPlannerStatus !== "ready" && guestPlannerStatus !== "none"
      ? guestStorageError(guestPlannerStatus)
      : null,
  );

  currentStateRef.current = currentState;
  fetcherStateRef.current = fetcher.state;
  fetcherSubmitRef.current = fetcher.submit;

  useEffect(() => {
    if (lastSavedStateRef.current === null) {
      lastSavedStateRef.current = savedShopState ?? currentStateRef.current;
      return;
    }

    if (savedShopState && eventShopStatesEqual(lastSavedStateRef.current, savedShopState)) {
      lastSavedStateRef.current = savedShopState;
    }
  }, [savedShopState]);

  const saveGuestState = useCallback(
    (nextState: EventShopState, force = false) => {
      const baseline = lastSavedStateRef.current;
      if (baseline && eventShopStatesEqual(baseline, nextState) && !force) return;
      const plan: GuestEventShopPlan = { timelineUid, shopStateUid, state: nextState };
      const result = persistGuestEventShopPlanImmediately(plan);
      if (result.status === "ready") {
        lastSavedStateRef.current = nextState;
        setSaveError(null);
        return;
      }
      setSaveError(guestStorageError(result.status));
    },
    [shopStateUid, timelineUid],
  );

  useEffect(() => {
    if (signedIn || isInitialLoad) return;
    saveGuestState(currentState, guestPlannerStatus === "memory");
  }, [currentState, guestPlannerStatus, isInitialLoad, saveGuestState, signedIn]);

  useEffect(() => {
    if (signedIn) return;
    const flush = () => saveGuestState(currentStateRef.current, guestPlannerStatus === "memory");
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [guestPlannerStatus, saveGuestState, signedIn]);

  useEffect(() => {
    if (!signedIn || isInitialLoad) return;

    const interval = setInterval(() => {
      if (accountSaveFailedRef.current || pendingAccountSaveRef.current) return;
      if (fetcherStateRef.current !== "idle") return;

      const currentState = currentStateRef.current;
      const needsInitialSave = initialAccountSavePendingRef.current;
      if (
        !needsInitialSave &&
        lastSavedStateRef.current &&
        eventShopStatesEqual(lastSavedStateRef.current, currentState)
      ) {
        return;
      }

      const baseState = lastSavedStateRef.current ?? currentState;
      const requestId = `detail-save-${Date.now()}-${++accountSaveSequenceRef.current}`;
      pendingAccountSaveRef.current = { state: currentState, requestId };
      try {
        fetcherSubmitRef.current(
          { save: currentState, base: baseState, requestId },
          {
            method: "post",
            action: `/api/events/${timelineUid}/shop-state`,
            encType: "application/json",
          },
        );
      } catch {
        pendingAccountSaveRef.current = null;
        accountSaveFailedRef.current = true;
        setSaveError("상점 계획을 저장하지 못했어요. 다시 시도해주세요.");
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isInitialLoad, signedIn, timelineUid]);

  useEffect(() => {
    if (!pendingAccountSaveRef.current) return;

    const pendingSave = pendingAccountSaveRef.current;
    const resolution = resolveAccountSaveResponse({
      fetcherState: fetcher.state,
      fetcherData: fetcher.data,
      requestId: pendingSave.requestId,
    });
    if (resolution.status === "pending") return;

    pendingAccountSaveRef.current = null;
    if (resolution.status === "success") {
      lastSavedStateRef.current = pendingSave.state;
      initialAccountSavePendingRef.current = false;
      accountSaveFailedRef.current = false;
      setSaveError(null);
      return;
    }

    accountSaveFailedRef.current = true;
    setSaveError(resolution.error);
  }, [fetcher.data, fetcher.state]);

  const retrySave = useCallback(() => {
    const currentState = currentStateRef.current;
    if (!signedIn) {
      if (
        savedShopState === null &&
        lastSavedStateRef.current &&
        eventShopStatesEqual(lastSavedStateRef.current, currentState)
      ) {
        const snapshot = readGuestEventShopPlanner();
        setSaveError(snapshot.status === "ready" ? null : guestStorageError(snapshot.status));
        return;
      }
      saveGuestState(currentState, true);
      return;
    }
    if (fetcherStateRef.current !== "idle" || pendingAccountSaveRef.current) return;

    const baseState = lastSavedStateRef.current ?? currentState;
    const requestId = `detail-save-${Date.now()}-${++accountSaveSequenceRef.current}`;
    pendingAccountSaveRef.current = { state: currentState, requestId };
    accountSaveFailedRef.current = false;
    try {
      fetcherSubmitRef.current(
        { save: currentState, base: baseState, requestId },
        {
          method: "post",
          action: `/api/events/${timelineUid}/shop-state`,
          encType: "application/json",
        },
      );
    } catch {
      pendingAccountSaveRef.current = null;
      accountSaveFailedRef.current = true;
      setSaveError("상점 계획을 저장하지 못했어요. 다시 시도해주세요.");
    }
  }, [savedShopState, saveGuestState, signedIn, timelineUid]);

  const isSaving = fetcher.state === "submitting" || fetcher.state === "loading";
  return { isSaving, saveError, retrySave };
}
