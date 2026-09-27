import { describe, expect, it } from "@jest/globals";
import { createDefaultEventShopState } from "~/domain/event-shop-state";
import {
  compareGuestEventShopPlans,
  countUnresolvedGuestEventShopPlans,
  createEmptyGuestEventShopPlanner,
  filterDefaultGuestEventShopPlans,
  hasGuestEventShopPlannerData,
  normalizeGuestEventShopPlanner,
  parseGuestEventShopPlanner,
  patchGuestEventShopPlanOwnedQuantities,
  removeGuestEventShopPlanIfUnchanged,
  upsertGuestEventShopPlan,
} from "~/domain/guest-event-shop-planner";

describe("guest event shop planner", () => {
  it("validates and round-trips complete event plans", () => {
    const envelope = createEmptyGuestEventShopPlanner();
    expect(hasGuestEventShopPlannerData(envelope.data)).toBe(false);

    const data = upsertGuestEventShopPlan(envelope.data, {
      timelineUid: "timeline-1",
      shopStateUid: "shop-1",
      state: createDefaultEventShopState([], []),
    });
    const stored = { ...envelope, data };

    expect(hasGuestEventShopPlannerData(data)).toBe(true);
    expect(parseGuestEventShopPlanner(JSON.stringify(stored))).toEqual(stored);
    expect(
      normalizeGuestEventShopPlanner({
        ...stored,
        data: { plans: { "shop-1": { ...data.plans["shop-1"], state: {} } } },
      }),
    ).toBeNull();
  });

  it("patches only current owned quantities and preserves newer guest edits during cleanup", () => {
    const envelope = createEmptyGuestEventShopPlanner();
    const defaults = createDefaultEventShopState([], ["student-1"]);
    const original = {
      timelineUid: "timeline-1",
      shopStateUid: "shop-1",
      state: defaults,
    };
    const first = upsertGuestEventShopPlan(envelope.data, original);
    const patched = patchGuestEventShopPlanOwnedQuantities(first, {
      timelineUid: "timeline-1",
      shopStateUid: "shop-1",
      defaults,
      patch: { "currency-1": 42 },
    });
    const current = patched.plans["shop-1"];

    expect(current?.state.existingPaymentItemQuantities).toEqual({ "currency-1": 42 });
    expect(current?.state.selectedBonusStudentUids).toEqual(["student-1"]);
    expect(removeGuestEventShopPlanIfUnchanged(patched, original).plans["shop-1"]).toEqual(current);
    expect(removeGuestEventShopPlanIfUnchanged(patched, current as NonNullable<typeof current>).plans).toEqual({});
  });

  it("rejects malformed and mismatched canonical plan keys", () => {
    expect(parseGuestEventShopPlanner("not-json")).toBeNull();
    const envelope = createEmptyGuestEventShopPlanner();
    const data = upsertGuestEventShopPlan(envelope.data, {
      timelineUid: "timeline-1",
      shopStateUid: "shop-1",
      state: createDefaultEventShopState([], []),
    });
    expect(
      normalizeGuestEventShopPlanner({ ...envelope, data: { plans: { wrong: data.plans["shop-1"] } } }),
    ).toBeNull();
  });

  it("counts guest-only, different, and unavailable canonical plans once while excluding identical copies", () => {
    const state = createDefaultEventShopState([], []);
    const guestPlans = [
      { timelineUid: "timeline-1", shopStateUid: "shop-1", state },
      { timelineUid: "timeline-2", shopStateUid: "shop-2", state },
      { timelineUid: "timeline-3", shopStateUid: "shop-3", state },
      { timelineUid: "timeline-4", shopStateUid: "shop-4", state },
      { timelineUid: "timeline-4-rerun", shopStateUid: "shop-4", state },
    ];

    const comparisons = compareGuestEventShopPlans(guestPlans, {
      "shop-1": { status: "available", state },
      "shop-2": { status: "available", state: null },
      "shop-3": { status: "available", state: { ...state, includeFirstClear: true } },
      "shop-4": { status: "unavailable" },
    });

    expect(comparisons.map(({ status }) => status)).toEqual(["identical", "guest-only", "different", "unavailable"]);
    expect(
      countUnresolvedGuestEventShopPlans(guestPlans, {
        "shop-1": { status: "available", state },
        "shop-2": { status: "available", state: null },
        "shop-3": { status: "available", state: { ...state, includeFirstClear: true } },
        "shop-4": { status: "unavailable" },
      }),
    ).toBe(3);
  });

  it("treats exact runtime defaults as no guest or account input when defaults are resolved", () => {
    const defaults = createDefaultEventShopState([], ["student-1"]);
    const guestPlans = [
      { timelineUid: "timeline-1", shopStateUid: "shop-1", state: defaults },
      {
        timelineUid: "timeline-2",
        shopStateUid: "shop-2",
        state: { ...defaults, itemQuantities: { "shop-item-1": 2 } },
      },
      { timelineUid: "timeline-3", shopStateUid: "shop-3", state: defaults },
    ];
    const defaultsByShopStateUid = { "shop-1": defaults, "shop-2": defaults };
    const accountStates = {
      "shop-1": { status: "available" as const, state: { ...defaults, includeFirstClear: true } },
      "shop-2": { status: "available" as const, state: defaults },
      "shop-3": { status: "available" as const, state: defaults },
    };

    expect(filterDefaultGuestEventShopPlans(guestPlans, defaultsByShopStateUid)).toEqual(guestPlans.slice(1));
    expect(
      compareGuestEventShopPlans(guestPlans, accountStates, defaultsByShopStateUid).map(({ status }) => status),
    ).toEqual(["guest-only", "unavailable"]);
    expect(countUnresolvedGuestEventShopPlans(guestPlans, accountStates, defaultsByShopStateUid)).toBe(2);
  });
});
