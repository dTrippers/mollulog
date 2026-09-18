import { describe, expect, it } from "@jest/globals";
import { resolveSaveSubmitOutcome } from "../../../../../../../app/components/features/events/shop/hooks/useAutoSave";
import {
  getInitialLastSavedState,
  type ShopState,
  toEventShopState,
} from "../../../../../../../app/components/features/events/shop/hooks/useShopState";
import type { EventShopState } from "../../../../../../../app/models/event-shop-state";

function createLiveState(overrides: Partial<ShopState> = {}): ShopState {
  return {
    itemQuantities: { "daily-ticket": 60 },
    itemPurchaseDays: { "daily-ticket": 1 },
    selectedBonusStudentUids: ["student-1"],
    bonusStudentSelectionMode: "shared",
    selectedBonusStudentUidsByItem: {},
    includeRecruitedStudents: true,
    enabledStages: { "stage-1": true },
    existingPaymentItemQuantities: { pyroxene: 120 },
    includeFirstClear: false,
    extraStageRuns: {},
    minigameStartRound: 1,
    minigamePlayCount: 0,
    minigamePaymentQuantityMode: "expected",
    overriddenRequiredQuantities: {},
    ...overrides,
  };
}

function createSavedShopState(overrides: Partial<EventShopState> = {}): EventShopState {
  return {
    itemQuantities: {},
    itemPurchaseDays: {},
    selectedBonusStudentUids: [],
    bonusStudentSelectionMode: "shared",
    selectedBonusStudentUidsByItem: {},
    enabledStages: {},
    includeRecruitedStudents: true,
    existingPaymentItemQuantities: {},
    includeFirstClear: false,
    extraStageRuns: {},
    minigameStartRound: 1,
    minigamePlayCount: 0,
    minigamePaymentQuantityMode: "expected",
    overriddenRequiredQuantities: {},
    ...overrides,
  };
}

describe("toEventShopState", () => {
  it("serializes every live state field into the persisted shape", () => {
    const state = createLiveState();
    expect(toEventShopState(state)).toEqual(createSavedShopState({ ...state }));
  });

  it("produces a stable serialization regardless of input key order", () => {
    const state = createLiveState();
    const reorderedKeysFirst: ShopState = {
      overriddenRequiredQuantities: { "item-2": 3 },
      minigamePaymentQuantityMode: "expected",
      extraStageRuns: {},
      minigamePlayCount: 2,
      includeFirstClear: false,
      existingPaymentItemQuantities: { pyroxene: 120 },
      minigameStartRound: 1,
      enabledStages: { "stage-1": true },
      includeRecruitedStudents: true,
      selectedBonusStudentUidsByItem: {},
      bonusStudentSelectionMode: "shared",
      selectedBonusStudentUids: ["student-1"],
      itemPurchaseDays: { "daily-ticket": 1 },
      itemQuantities: { "daily-ticket": 60 },
    };
    const sameStateDifferentOrder = createLiveState({
      minigamePlayCount: 2,
      overriddenRequiredQuantities: { "item-2": 3 },
    });

    expect(JSON.stringify(toEventShopState(reorderedKeysFirst))).toBe(
      JSON.stringify(toEventShopState(sameStateDifferentOrder)),
    );
    expect(JSON.stringify(toEventShopState(reorderedKeysFirst))).not.toBe(JSON.stringify(toEventShopState(state)));
  });
});

describe("getInitialLastSavedState", () => {
  it("uses the server-loaded state as the save baseline when one exists", () => {
    const savedShopState = createSavedShopState({ minigamePlayCount: 4 });
    expect(getInitialLastSavedState(savedShopState, createLiveState())).toBe(savedShopState);
  });

  it("falls back to the state at mount so the untouched default state is never saved", () => {
    const state = createLiveState();
    expect(getInitialLastSavedState(null, state)).toEqual(toEventShopState(state));
  });
});

describe("resolveSaveSubmitOutcome", () => {
  const submittedState = createSavedShopState({ minigamePlayCount: 4 });

  it("confirms the submitted state on a first-attempt success", () => {
    const data = { success: true };
    const resolution = resolveSaveSubmitOutcome({
      fetcherState: "idle",
      fetcherData: data,
      acknowledgedData: undefined,
      submittedState,
    });

    expect(resolution.confirmedSavedState).toBe(submittedState);
    expect(resolution.acknowledgedData).toBe(data);
  });

  it("does not confirm while a submit is still in flight", () => {
    for (const fetcherState of ["submitting", "loading"] as const) {
      const data = { success: true };
      const resolution = resolveSaveSubmitOutcome({
        fetcherState,
        fetcherData: data,
        acknowledgedData: undefined,
        submittedState,
      });

      expect(resolution.confirmedSavedState).toBeNull();
      expect(resolution.acknowledgedData).toBe(undefined);
    }
  });

  it("ignores a first-attempt failure with no fetcher data", () => {
    const resolution = resolveSaveSubmitOutcome({
      fetcherState: "idle",
      fetcherData: undefined,
      acknowledgedData: undefined,
      submittedState,
    });

    expect(resolution.confirmedSavedState).toBeNull();
    expect(resolution.acknowledgedData).toBe(undefined);
  });

  it("keeps the save dirty when a failure after a success replays the previous data", () => {
    const data = { success: true };
    const resolution = resolveSaveSubmitOutcome({
      fetcherState: "idle",
      fetcherData: data,
      acknowledgedData: data,
      submittedState,
    });

    expect(resolution.confirmedSavedState).toBeNull();
    expect(resolution.acknowledgedData).toBe(data);
  });

  it("confirms a retry that succeeds after a failure with a fresh result", () => {
    const data = { success: true };
    const resolution = resolveSaveSubmitOutcome({
      fetcherState: "idle",
      fetcherData: data,
      acknowledgedData: { success: true },
      submittedState,
    });

    expect(resolution.confirmedSavedState).toBe(submittedState);
    expect(resolution.acknowledgedData).toBe(data);
  });

  it("acknowledges a fresh failure result without confirming", () => {
    const data = { success: false };
    const resolution = resolveSaveSubmitOutcome({
      fetcherState: "idle",
      fetcherData: data,
      acknowledgedData: undefined,
      submittedState,
    });

    expect(resolution.confirmedSavedState).toBeNull();
    expect(resolution.acknowledgedData).toBe(data);
  });
});
