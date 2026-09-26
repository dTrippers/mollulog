import { describe, expect, it } from "@jest/globals";
import {
  createDefaultEventShopState,
  eventShopStatesEqual,
  mergeEventShopStateChanges,
  normalizeEventShopState,
  patchEventShopOwnedQuantities,
} from "~/domain/event-shop-state";

describe("event shop state", () => {
  it("creates the detailed planner defaults and patches only current owned quantities", () => {
    const defaults = createDefaultEventShopState(
      [
        { uid: "stage-8", entryAp: 10, index: "8", difficulty: 0, rewards: [] },
        { uid: "stage-9", entryAp: 10, index: "9", difficulty: 0, rewards: [] },
      ],
      ["student-1"],
    );

    expect(defaults.enabledStages).toEqual({ "stage-8": false, "stage-9": true });
    expect(defaults.selectedBonusStudentUids).toEqual(["student-1"]);

    const patched = patchEventShopOwnedQuantities(defaults, { "currency-1": 650, "currency-2": 0 });
    expect(patched.existingPaymentItemQuantities).toEqual({ "currency-1": 650, "currency-2": 0 });
    expect(patched.itemQuantities).toEqual(defaults.itemQuantities);
    expect(patched.enabledStages).toEqual(defaults.enabledStages);
    expect(patched.selectedBonusStudentUids).toEqual(defaults.selectedBonusStudentUids);
  });

  it("treats omitted and zero quantities as equivalent only where calculations do", () => {
    const state = createDefaultEventShopState([], []);
    const explicitZeros = {
      ...state,
      itemQuantities: { "item-1": 0 },
      existingPaymentItemQuantities: { "currency-1": 0 },
      extraStageRuns: { "stage-1": 0 },
    };

    expect(eventShopStatesEqual(state, explicitZeros)).toBe(true);
    expect(
      eventShopStatesEqual(state, {
        ...state,
        overriddenRequiredQuantities: { "item-1": 0 },
      }),
    ).toBe(false);
  });

  it("rejects invalid stored quantities instead of normalizing them to zero", () => {
    const state = createDefaultEventShopState([], []);
    expect(normalizeEventShopState({ ...state, existingPaymentItemQuantities: { "currency-1": -1 } })).toBeNull();
    expect(normalizeEventShopState({ ...state, minigamePaymentQuantityMode: "unknown" })).toBeNull();
  });

  it("preserves fields changed elsewhere when the detailed screen submits an older full state", () => {
    const base = {
      ...createDefaultEventShopState([], []),
      existingPaymentItemQuantities: { "currency-1": 10 },
    };
    const submitted = { ...base, itemQuantities: { "item-1": 2 } };
    const latest = { ...base, existingPaymentItemQuantities: { "currency-1": 55 } };

    expect(mergeEventShopStateChanges(base, submitted, latest)).toMatchObject({
      itemQuantities: { "item-1": 2 },
      existingPaymentItemQuantities: { "currency-1": 55 },
    });
  });
});
