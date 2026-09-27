import { describe, expect, it } from "@jest/globals";
import { createDefaultEventShopState } from "~/domain/event-shop-state";
import { createEmptyGuestEventShopPlanner, upsertGuestEventShopPlan } from "~/domain/guest-event-shop-planner";
import {
  clearGuestPlannerSectionsIfUnchanged,
  createEmptyGuestPlanner,
  createGuestPlannerFromLegacySources,
  createGuestPlannerLegacyMirror,
  guestPlannerHasData,
  hasUnresolvedGuestPlannerOptions,
  mergeGuestPlannerLegacyChanges,
  normalizeGuestPlanner,
  updateGuestPlannerOptions,
} from "~/domain/guest-planner";
import { createEmptyGuestPyroxenePlanner, type GuestPyroxeneRecord } from "~/domain/guest-pyroxene-planner";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";

describe("guest planner envelope", () => {
  it("validates the account-shaped document and rejects invalid stored sections", () => {
    const envelope = createEmptyGuestPlanner();
    expect(normalizeGuestPlanner(envelope)).toMatchObject({
      datasetId: envelope.datasetId,
      document: { schemaVersion: 1, pyroxene: { records: [] }, eventShops: {}, ap: null },
    });
    expect(normalizeGuestPlanner({ ...envelope, document: { ...envelope.document, schemaVersion: 2 } })).toBeNull();
    expect(normalizeGuestPlanner({ ...envelope, document: { ...envelope.document, ap: {} } })).toBeNull();
  });

  it("ignores the retired legacy acknowledgement field when reading stored envelopes", () => {
    const envelope = createEmptyGuestPlanner() as ReturnType<typeof createEmptyGuestPlanner> & {
      legacyAcknowledgements?: unknown;
    };
    envelope.legacyAcknowledgements = [{ source: "invalid", signature: "x", sections: "untrusted" }];

    const normalized = normalizeGuestPlanner(envelope);

    expect(normalized).not.toBeNull();
    expect(normalized).not.toHaveProperty("legacyAcknowledgements");
  });

  it("rejects guest envelopes that exceed the old parser's bounds and the shop/conflict caps", () => {
    const envelope = createEmptyGuestPlanner();

    expect(
      normalizeGuestPlanner({
        ...envelope,
        document: {
          ...envelope.document,
          pyroxene: { ...envelope.document.pyroxene, records: Array.from({ length: 501 }, () => ({})) },
        },
      }),
    ).toBeNull();
    expect(
      normalizeGuestPlanner({
        ...envelope,
        document: {
          ...envelope.document,
          pyroxene: {
            ...envelope.document.pyroxene,
            collectedSourceKeys: Array.from({ length: 1_001 }, (_, index) => `source-${index}`),
          },
        },
      }),
    ).toBeNull();
    expect(
      normalizeGuestPlanner({
        ...envelope,
        document: {
          ...envelope.document,
          pyroxene: {
            ...envelope.document.pyroxene,
            collectedSourceKeys: ["s".repeat(201)],
          },
        },
      }),
    ).toBeNull();
    expect(
      normalizeGuestPlanner({
        ...envelope,
        favorites: Array.from({ length: 1_001 }, () => ({ contentUid: "content", studentUid: "student" })),
      }),
    ).toBeNull();
    expect(
      normalizeGuestPlanner({
        ...envelope,
        favorites: [{ contentUid: "c".repeat(201), studentUid: "student" }],
      }),
    ).toBeNull();
    expect(
      normalizeGuestPlanner({
        ...envelope,
        document: {
          ...envelope.document,
          pyroxene: {
            ...envelope.document.pyroxene,
            records: [{ uid: "u".repeat(201), description: "" }],
          },
        },
      }),
    ).toBeNull();
    const oldPyroxene = createEmptyGuestPyroxenePlanner();
    const oldEventShops = createEmptyGuestEventShopPlanner();
    const legacyMirror = createGuestPlannerLegacyMirror(envelope, { pyroxene: oldPyroxene, eventShops: oldEventShops });
    expect(
      normalizeGuestPlanner({
        ...envelope,
        legacyMirror: {
          ...legacyMirror,
          pyroxene: {
            ...legacyMirror.pyroxene,
            data: { ...legacyMirror.pyroxene.data, eventTrials: { ["e".repeat(201)]: 1 } },
          },
        },
      }),
    ).toBeNull();
    expect(
      normalizeGuestPlanner({
        ...envelope,
        document: {
          ...envelope.document,
          pyroxene: {
            ...envelope.document.pyroxene,
            records: [{ uid: "record-1", description: "설명".repeat(101) }],
          },
        },
      }),
    ).toBeNull();
    expect(
      normalizeGuestPlanner({
        ...envelope,
        document: {
          ...envelope.document,
          pyroxene: {
            ...envelope.document.pyroxene,
            eventData: { ["e".repeat(201)]: { completed: false, expectedTrials: 1 } },
          },
        },
      }),
    ).toBeNull();
    expect(
      normalizeGuestPlanner({
        ...envelope,
        document: {
          ...envelope.document,
          eventShops: Object.fromEntries(
            Array.from({ length: 501 }, (_, index) => [`shop-${index}`, createDefaultEventShopState([], [])]),
          ),
        },
      }),
    ).toBeNull();

    const oversizedShopState = createDefaultEventShopState([], []);
    oversizedShopState.itemQuantities = Object.fromEntries(
      Array.from({ length: 1_001 }, (_, index) => [`item-${index}`, 1]),
    );
    expect(
      normalizeGuestPlanner({
        ...envelope,
        document: { ...envelope.document, eventShops: { shop: oversizedShopState } },
        eventShopTimelineUids: { shop: "timeline" },
      }),
    ).toBeNull();
    expect(normalizeGuestPlanner({ ...envelope, legacyConflicts: Array.from({ length: 21 }, () => ({})) })).toBeNull();
  });

  it("preserves the legacy optionsChanged flag for planner comparisons", () => {
    const legacy = createEmptyGuestPyroxenePlanner();
    legacy.data.options = {
      ...defaultPyroxenePlannerOptions,
      raid: { ...defaultPyroxenePlannerOptions.raid, tier: "gold" },
    };
    legacy.data.optionsChanged = false;

    const unchanged = createGuestPlannerFromLegacySources({ pyroxene: legacy, eventShops: null });
    expect(unchanged.pyroxeneOptionsChanged).toBe(false);
    expect(guestPlannerHasData(unchanged)).toBe(false);

    legacy.data.optionsChanged = true;
    const changed = createGuestPlannerFromLegacySources({ pyroxene: legacy, eventShops: null });
    expect(changed.pyroxeneOptionsChanged).toBe(true);
    expect(guestPlannerHasData(changed)).toBe(true);
    const accountOptions = {
      ...defaultPyroxenePlannerOptions,
      raid: { ...defaultPyroxenePlannerOptions.raid, tier: "platinum" as const },
    };
    expect(hasUnresolvedGuestPlannerOptions(false, legacy.data.options, accountOptions)).toBe(false);
    expect(hasUnresolvedGuestPlannerOptions(true, legacy.data.options, accountOptions)).toBe(true);
    expect(updateGuestPlannerOptions(createEmptyGuestPlanner(), legacy.data.options).pyroxeneOptionsChanged).toBe(true);
  });

  it("clears every item in confirmed sections, including entries omitted from the selection", () => {
    const envelope = createEmptyGuestPlanner();
    envelope.document.pyroxene.resources = {
      inputAt: "2026-09-01T00:00:00.000Z",
      pyroxene: 1200,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    };
    envelope.document.pyroxene.records = [
      {
        uid: "record-1",
        eventAt: "2026-09-02T00:00:00.000Z",
        source: "other",
        repeatType: "fixed_days",
        repeatIntervalDays: null,
        repeatCount: null,
        autoRepurchase: false,
        description: "보상",
        pyroxeneDelta: 50,
        oneTimeTicketDelta: 0,
        tenTimeTicketDelta: 0,
      },
    ];
    envelope.document.pyroxene.options = {
      ...defaultPyroxenePlannerOptions,
      consumption: { ...defaultPyroxenePlannerOptions.consumption, apChargeCount: 1 },
    };
    envelope.pyroxeneOptionsChanged = true;
    envelope.document.pyroxene.collectedSourceKeys = ["source-1"];
    envelope.document.pyroxene.eventData = { "event-1": { completed: false, expectedTrials: 200 } };
    envelope.favorites = [{ contentUid: "content-1", studentUid: "student-1" }];
    envelope.document.eventShops = { "shop-1": createDefaultEventShopState([], []) };
    envelope.eventShopTimelineUids = { "shop-1": "timeline-1" };

    const cleared = clearGuestPlannerSectionsIfUnchanged(envelope, envelope, [
      "resources",
      "records",
      "options",
      "recruitment",
      "collectedSourceKeys",
      "eventShops",
    ]);

    expect(cleared.document.pyroxene.resources).toBeNull();
    expect(cleared.document.pyroxene.records).toEqual([]);
    expect(cleared.document.pyroxene.options).toEqual(defaultPyroxenePlannerOptions);
    expect(cleared.pyroxeneOptionsChanged).toBe(false);
    expect(cleared.document.pyroxene.collectedSourceKeys).toEqual([]);
    expect(cleared.document.pyroxene.eventData).toEqual({});
    expect(cleared.favorites).toEqual([]);
    expect(cleared.document.eventShops).toEqual({});
    expect(cleared.eventShopTimelineUids).toEqual({});
    expect(guestPlannerHasData(cleared)).toBe(false);
  });

  it("keeps a section when the current guest source changed after the submitted snapshot", () => {
    const submitted = createEmptyGuestPlanner();
    submitted.document.pyroxene.resources = {
      inputAt: "2026-09-01T00:00:00.000Z",
      pyroxene: 1200,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    };
    const current = {
      ...submitted,
      document: {
        ...submitted.document,
        pyroxene: {
          ...submitted.document.pyroxene,
          resources: { ...submitted.document.pyroxene.resources, pyroxene: 1500 },
        },
      },
    };

    const result = clearGuestPlannerSectionsIfUnchanged(current, submitted, ["resources"]);

    expect(result.document.pyroxene.resources).toEqual({ ...submitted.document.pyroxene.resources, pyroxene: 1500 });
  });

  it("merges old-tab record additions, removals, and edits by record ID", () => {
    const pyroxene = createEmptyGuestPyroxenePlanner();
    const record = (recordId: string, description: string): GuestPyroxeneRecord => ({
      recordId,
      createdAt: "2026-09-01T00:00:00.000Z",
      kind: "other",
      resources: { pyroxene: 20, oneTimeTicket: 0, tenTimeTicket: 0 },
      description,
      date: "2026-09-02T00:00:00.000Z",
    });
    pyroxene.data.records = [record("record000001", "기존 1"), record("record000002", "기존 2")];
    const shops = createEmptyGuestEventShopPlanner();
    const base = createGuestPlannerFromLegacySources({ pyroxene, eventShops: shops });
    base.legacyMirror = createGuestPlannerLegacyMirror(base, { pyroxene, eventShops: shops });
    const submittedPyroxene = {
      ...pyroxene,
      revision: 2,
      data: {
        ...pyroxene.data,
        records: [record("record000001", "수정된 값"), record("record000003", "새 계획")],
      },
    };

    const result = mergeGuestPlannerLegacyChanges(base, submittedPyroxene, shops);
    const descriptions = result.envelope.document.pyroxene.records.map(({ description }) => description);

    expect(descriptions).toContain("수정된 값");
    expect(descriptions).toContain("새 계획");
    expect(descriptions).not.toContain("기존 2");
    expect(result.conflict).toBeNull();
  });

  it("merges concurrent edits to different option and event-shop fields", () => {
    const pyroxene = createEmptyGuestPyroxenePlanner();
    pyroxene.data.resources = {
      inputAt: "2026-09-01T00:00:00.000Z",
      pyroxene: 1200,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    };
    const shops = createEmptyGuestEventShopPlanner();
    const shopState = {
      ...createDefaultEventShopState([], []),
      itemQuantities: { item: 1 },
    };
    const withShop = {
      ...shops,
      data: upsertGuestEventShopPlan(shops.data, {
        timelineUid: "event-timeline-1",
        shopStateUid: "shop-1",
        state: shopState,
      }),
    };
    const pyroxeneResources = pyroxene.data.resources;
    if (!pyroxeneResources) throw new Error("Fixture resources are missing.");
    const base = createGuestPlannerFromLegacySources({ pyroxene, eventShops: withShop });
    base.legacyMirror = createGuestPlannerLegacyMirror(base, { pyroxene, eventShops: withShop });
    const current = {
      ...base,
      document: {
        ...base.document,
        pyroxene: {
          ...base.document.pyroxene,
          options: {
            ...base.document.pyroxene.options,
            raid: { ...base.document.pyroxene.options.raid, tier: "gold" as const },
          },
        },
        eventShops: {
          ...base.document.eventShops,
          "shop-1": { ...shopState, existingPaymentItemQuantities: { currency: 2 } },
        },
      },
    };
    const submittedPyroxene = {
      ...pyroxene,
      revision: 1,
      data: {
        ...pyroxene.data,
        resources: { ...pyroxeneResources, pyroxene: 1800 },
        options: {
          ...pyroxene.data.options,
          event: { ...pyroxene.data.options.event, pickupChance: "average_pity" as const },
        },
        optionsChanged: true,
      },
    };
    const submittedShopState = { ...shopState, itemQuantities: { item: 3 } };
    const submittedShops = {
      ...withShop,
      revision: 1,
      data: upsertGuestEventShopPlan(withShop.data, {
        timelineUid: "event-timeline-1",
        shopStateUid: "shop-1",
        state: submittedShopState,
      }),
    };

    const result = mergeGuestPlannerLegacyChanges(current, submittedPyroxene, submittedShops);

    expect(result.envelope.document.pyroxene.options.raid.tier).toBe("gold");
    expect(result.envelope.document.pyroxene.options.event.pickupChance).toBe("average_pity");
    expect(result.envelope.document.pyroxene.resources?.pyroxene).toBe(1800);
    expect(result.envelope.document.eventShops["shop-1"].itemQuantities).toEqual({ item: 3 });
    expect(result.envelope.document.eventShops["shop-1"].existingPaymentItemQuantities).toEqual({ currency: 2 });
    expect(result.conflict).toBeNull();
  });

  it("preserves a divergent legacy value as a conflict instead of overwriting the canonical value", () => {
    const pyroxene = createEmptyGuestPyroxenePlanner();
    pyroxene.data.resources = {
      inputAt: "2026-09-01T00:00:00.000Z",
      pyroxene: 1200,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    };
    const shops = createEmptyGuestEventShopPlanner();
    const base = createGuestPlannerFromLegacySources({ pyroxene, eventShops: shops });
    const baseResources = base.document.pyroxene.resources;
    const submittedResources = pyroxene.data.resources;
    if (!baseResources || !submittedResources) throw new Error("Fixture resources are missing.");
    base.legacyMirror = createGuestPlannerLegacyMirror(base, { pyroxene, eventShops: shops });
    const current = {
      ...base,
      document: {
        ...base.document,
        pyroxene: {
          ...base.document.pyroxene,
          resources: { ...baseResources, pyroxene: 2400 },
        },
      },
    };
    const submittedPyroxene = {
      ...pyroxene,
      revision: 1,
      data: { ...pyroxene.data, resources: { ...submittedResources, pyroxene: 1800 } },
    };

    const result = mergeGuestPlannerLegacyChanges(current, submittedPyroxene, shops);

    expect(result.envelope.document.pyroxene.resources?.pyroxene).toBe(2400);
    expect(result.conflict?.keys.pyroxene.resources).toBe(true);
    expect(result.conflict?.pyroxene?.data.resources?.pyroxene).toBe(1800);
  });

  it("keeps a conflicting edit to the same event-shop field for explicit comparison", () => {
    const pyroxene = createEmptyGuestPyroxenePlanner();
    const shops = createEmptyGuestEventShopPlanner();
    const baseState = { ...createDefaultEventShopState([], []), itemQuantities: { item: 1 } };
    const baseShops = {
      ...shops,
      data: upsertGuestEventShopPlan(shops.data, {
        timelineUid: "event-timeline-1",
        shopStateUid: "shop-1",
        state: baseState,
      }),
    };
    const base = createGuestPlannerFromLegacySources({ pyroxene, eventShops: baseShops });
    base.legacyMirror = createGuestPlannerLegacyMirror(base, { pyroxene, eventShops: baseShops });
    const currentState = { ...baseState, itemQuantities: { item: 2 } };
    const current = {
      ...base,
      document: { ...base.document, eventShops: { "shop-1": currentState } },
    };
    const legacyState = { ...baseState, itemQuantities: { item: 3 } };
    const submittedShops = {
      ...baseShops,
      revision: 2,
      data: upsertGuestEventShopPlan(baseShops.data, {
        timelineUid: "event-timeline-1",
        shopStateUid: "shop-1",
        state: legacyState,
      }),
    };

    const result = mergeGuestPlannerLegacyChanges(current, pyroxene, submittedShops);

    expect(result.envelope.document.eventShops["shop-1"].itemQuantities).toEqual({ item: 2 });
    expect(result.conflict?.keys.eventShopUids).toEqual(["shop-1"]);
    expect(result.conflict?.eventShops?.data.plans["shop-1"].state.itemQuantities).toEqual({ item: 3 });
  });
});
