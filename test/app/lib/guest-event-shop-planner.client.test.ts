import { afterEach, describe, expect, it } from "@jest/globals";
import { createDefaultEventShopState } from "~/domain/event-shop-state";
import { parseGuestEventShopPlanner, upsertGuestEventShopPlan } from "~/domain/guest-event-shop-planner";
import {
  persistGuestEventShopPlanImmediately,
  readGuestEventShopPlanner,
  retryGuestEventShopPlannerPersistence,
  updateGuestEventShopPlanner,
} from "~/lib/guest-event-shop-planner.client";

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("guest event shop planner client storage", () => {
  it("persists plans and keeps failed writes available for an explicit retry", async () => {
    const stored = new Map<string, string>();
    let failWrites = false;
    let failReads = false;
    const localStorage = {
      getItem: (key: string) => {
        if (failReads) throw new Error("storage unavailable");
        return stored.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (failWrites) throw new Error("storage unavailable");
        stored.set(key, value);
      },
    } as Storage;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });

    expect(readGuestEventShopPlanner().status).toBe("ready");
    const defaults = createDefaultEventShopState([], ["student-1"]);
    const saved = await updateGuestEventShopPlanner((data) =>
      upsertGuestEventShopPlan(data, {
        timelineUid: "timeline-1",
        shopStateUid: "shop-1",
        state: defaults,
      }),
    );
    expect(saved.status).toBe("ready");

    failReads = true;
    expect(readGuestEventShopPlanner().status).toBe("memory");
    failReads = false;

    failWrites = true;
    const failed = persistGuestEventShopPlanImmediately({
      timelineUid: "timeline-1",
      shopStateUid: "shop-1",
      state: { ...defaults, existingPaymentItemQuantities: { "currency-1": 55 } },
    });
    expect(failed.status).toBe("memory");
    expect(readGuestEventShopPlanner()).toEqual(failed);

    const diskEnvelope = parseGuestEventShopPlanner([...stored.values()][0]);
    expect(diskEnvelope).not.toBeNull();
    if (diskEnvelope) {
      const otherTabData = upsertGuestEventShopPlan(diskEnvelope.data, {
        timelineUid: "timeline-2",
        shopStateUid: "shop-2",
        state: createDefaultEventShopState([], ["student-2"]),
      });
      stored.set(
        [...stored.keys()][0],
        JSON.stringify({ ...diskEnvelope, revision: diskEnvelope.revision + 1, data: otherTabData }),
      );
    }

    const retryWhileUnavailable = await retryGuestEventShopPlannerPersistence();
    expect(retryWhileUnavailable.status).toBe("memory");
    expect(retryWhileUnavailable).toMatchObject({
      envelope: {
        data: { plans: { "shop-1": { state: { existingPaymentItemQuantities: { "currency-1": 55 } } }, "shop-2": {} } },
      },
    });

    failWrites = false;
    expect((await retryGuestEventShopPlannerPersistence()).status).toBe("ready");
    expect(readGuestEventShopPlanner()).toMatchObject({
      status: "ready",
      envelope: {
        data: {
          plans: {
            "shop-1": { state: { existingPaymentItemQuantities: { "currency-1": 55 } } },
            "shop-2": { timelineUid: "timeline-2" },
          },
        },
      },
    });
  });

  it("synchronously persists a detail edit before its caller can navigate away", () => {
    const stored = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => stored.get(key) ?? null,
          setItem: (key: string, value: string) => stored.set(key, value),
        },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });

    const result = persistGuestEventShopPlanImmediately({
      timelineUid: "timeline-3",
      shopStateUid: "shop-3",
      state: createDefaultEventShopState([], ["student-3"]),
    });

    expect(result.status).toBe("ready");
    expect(parseGuestEventShopPlanner([...stored.values()][0])?.data.plans["shop-3"]).toMatchObject({
      timelineUid: "timeline-3",
      state: { selectedBonusStudentUids: ["student-3"] },
    });
  });

  it("reports a same-plan cross-tab conflict instead of replacing the newer plan", async () => {
    const stored = new Map<string, string>();
    let failWrites = false;
    const localStorage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) throw new Error("storage unavailable");
        stored.set(key, value);
      },
    } as Storage;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });

    const defaults = createDefaultEventShopState([], []);
    persistGuestEventShopPlanImmediately({ timelineUid: "timeline-4", shopStateUid: "shop-4", state: defaults });
    const raw = [...stored.values()][0];
    const base = parseGuestEventShopPlanner(raw);
    expect(base).not.toBeNull();
    if (!base) return;

    failWrites = true;
    const localDraft = persistGuestEventShopPlanImmediately({
      timelineUid: "timeline-4",
      shopStateUid: "shop-4",
      state: { ...defaults, existingPaymentItemQuantities: { "currency-1": 10 } },
    });
    expect(localDraft.status).toBe("memory");

    const otherTabEnvelope = {
      ...base,
      revision: base.revision + 1,
      data: upsertGuestEventShopPlan(base.data, {
        timelineUid: "timeline-4",
        shopStateUid: "shop-4",
        state: { ...defaults, existingPaymentItemQuantities: { "currency-1": 20 } },
      }),
    };
    stored.set([...stored.keys()][0], JSON.stringify(otherTabEnvelope));

    const result = await retryGuestEventShopPlannerPersistence();

    expect(result.status).toBe("conflict");
    expect(
      parseGuestEventShopPlanner([...stored.values()][0])?.data.plans["shop-4"]?.state.existingPaymentItemQuantities,
    ).toEqual({
      "currency-1": 20,
    });
  });
});
