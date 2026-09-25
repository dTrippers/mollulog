import { describe, expect, it } from "@jest/globals";
import { resolveAccountSaveResponse } from "../../../../../../../app/components/features/events/shop/hooks/useAutoSave";
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

describe("resolveAccountSaveResponse", () => {
  const requestId = "save-1";

  it("accepts an idle success only when the response requestId matches", () => {
    const resolution = resolveAccountSaveResponse({
      fetcherState: "idle",
      fetcherData: { success: true, requestId },
      requestId,
    });

    expect(resolution).toEqual({ status: "success" });
  });

  it("stays pending while a submit is in flight even if matching or stale success data is present", () => {
    for (const fetcherState of ["submitting", "loading"] as const) {
      const resolution = resolveAccountSaveResponse({
        fetcherState,
        fetcherData: { success: true, requestId },
        requestId,
      });

      expect(resolution).toEqual({ status: "pending" });
      expect(
        resolveAccountSaveResponse({
          fetcherState,
          fetcherData: { success: true, requestId: "save-old" },
          requestId,
        }),
      ).toEqual({ status: "pending" });
    }
  });

  it("rejects stale, mismatched, or missing response ids without confirming a save", () => {
    expect(
      resolveAccountSaveResponse({
        fetcherState: "idle",
        fetcherData: { success: true, requestId: "save-old" },
        requestId,
      }),
    ).toEqual({
      status: "mismatch",
      error: "저장 응답을 확인하지 못했어요. 현재 입력은 유지되어 있어요. 다시 시도해주세요.",
    });
    expect(
      resolveAccountSaveResponse({
        fetcherState: "idle",
        fetcherData: { success: true },
        requestId,
      }).status,
    ).toBe("mismatch");
    expect(
      resolveAccountSaveResponse({
        fetcherState: "idle",
        fetcherData: undefined,
        requestId,
      }).status,
    ).toBe("mismatch");
  });

  it("surfaces a matching failure and permits a retry with a new matching request id", () => {
    const failure = resolveAccountSaveResponse({
      fetcherState: "idle",
      fetcherData: { success: false, error: "저장 충돌", requestId },
      requestId,
    });
    expect(failure).toEqual({ status: "failure", error: "저장 충돌" });

    expect(
      resolveAccountSaveResponse({
        fetcherState: "idle",
        fetcherData: { success: false, requestId },
        requestId,
      }),
    ).toEqual({ status: "failure", error: "상점 계획을 저장하지 못했어요. 다시 시도해주세요." });

    const retry = resolveAccountSaveResponse({
      fetcherState: "idle",
      fetcherData: { success: true, requestId: "save-2" },
      requestId: "save-2",
    });
    expect(retry).toEqual({ status: "success" });
  });
});
