import { describe, expect, it } from "@jest/globals";
import {
  normalizeJankenPlannerProgress,
  PlannerStateProjectionError,
  type PlannerStateProjectionRows,
  projectPlannerStateDocument,
  sortPlannerStateTimelineRecords,
  withPyroxeneEventDataPatch,
} from "~/domain/planner-state";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";

const shopRow = {
  eventUid: "event-shop-1",
  itemQuantities: { "item-1": 3, "item-zero": 0 },
  itemPurchaseDays: { "item-1": 2 },
  selectedBonusStudentUids: ["student-1", "student-1"],
  bonusStudentSelectionMode: "shared",
  selectedBonusStudentUidsByItem: { "item-1": ["student-1", "student-1"] },
  enabledStages: { "stage-1": true },
  includeRecruitedStudents: true,
  existingPaymentItemQuantities: { "currency-1": 7 },
  includeFirstClear: true,
  extraStageRuns: { "stage-1": 2 },
  minigameStartRound: 4,
  minigamePlayCount: 5,
  jankenStagePlays: {},
  minigamePaymentQuantityMode: "max",
  cardFlipStrategy: "sr-reset",
  overriddenRequiredQuantities: { "item-1": 11 },
};

const timelineRow = {
  uid: "record-1",
  userId: 7,
  eventAt: new Date("2026-08-02T00:00:00.000Z"),
  source: "other",
  repeatType: null,
  repeatIntervalDays: null,
  repeatCount: null,
  autoRepurchase: false,
  description: "Manual record",
  pyroxeneDelta: 120,
  oneTimeTicketDelta: 2,
  tenTimeTicketDelta: 1,
};

function projectionRows(overrides: Partial<PlannerStateProjectionRows> = {}): PlannerStateProjectionRows {
  return {
    resources: [
      {
        uid: "owned-old",
        userId: 7,
        inputAt: new Date("2026-08-01T00:00:00.000Z"),
        pyroxene: 100,
        oneTimeTicket: 1,
        tenTimeTicket: 2,
      },
      {
        uid: "owned-latest",
        userId: 7,
        inputAt: new Date("2026-08-03T00:00:00.000Z"),
        pyroxene: 300,
        oneTimeTicket: 3,
        tenTimeTicket: 4,
      },
    ],
    timelineItems: [timelineRow],
    plannerOptions: [
      { userId: 7, options: JSON.stringify({ event: { pickupChance: "ceil" }, consumption: { apChargeCount: 2 } }) },
    ],
    collectedSources: [
      { userId: 7, sourceKey: "source-b" },
      { userId: 7, sourceKey: "source-a" },
    ],
    eventData: [{ uid: "event-data-1", userId: 7, eventUid: "event-1", completed: true, expectedTrials: 200 }],
    eventShops: [shopRow],
    ...overrides,
  };
}

describe("planner state projection", () => {
  it("defaults missing janken progress and rejects malformed entries", () => {
    expect(projectPlannerStateDocument(projectionRows()).jankenProgress).toEqual({});
    expect(normalizeJankenPlannerProgress({ "shop-1": { progress: { currentTier: 0 }, goals: {} } })).toBeNull();
    expect(
      normalizeJankenPlannerProgress({
        "shop-1": {
          progress: {
            currentTier: 3,
            heldEleph: 0,
            cumulativeScore: 0,
            equipmentTier: 1,
            heldEquipmentCurrency: 0,
            clearedStageUids: ["stage-2", "stage-2"],
          },
          goals: {
            targetTier: null,
            shopCurrencyMode: "linked",
            manualShopCurrency: 0,
            targetScore: null,
            averageScore: null,
            targetEquipmentTier: null,
          },
        },
      })?.["shop-1"].progress.clearedStageUids,
    ).toEqual(["stage-2"]);
  });

  it("sorts planner records by event time while preserving same-time order", () => {
    const input = [
      { uid: "later", eventAt: "2026-09-03T00:00:00.000Z" },
      { uid: "same-first", eventAt: "2026-09-02T00:00:00.000Z" },
      { uid: "same-second", eventAt: "2026-09-02T00:00:00.000Z" },
    ];

    expect(sortPlannerStateTimelineRecords(input).map(({ uid }) => uid)).toEqual([
      "same-first",
      "same-second",
      "later",
    ]);
    expect(input[0]?.uid).toBe("later");
  });

  it("keeps the latest resources and preserves planner payload fields", () => {
    const document = projectPlannerStateDocument(projectionRows());

    expect(document).toEqual({
      schemaVersion: 1,
      pyroxene: {
        resources: {
          inputAt: "2026-08-03T00:00:00.000Z",
          pyroxene: 300,
          oneTimeTicket: 3,
          tenTimeTicket: 4,
        },
        records: [
          {
            uid: "record-1",
            eventAt: "2026-08-02T00:00:00.000Z",
            source: "other",
            repeatType: "fixed_days",
            repeatIntervalDays: null,
            repeatCount: null,
            autoRepurchase: false,
            description: "Manual record",
            pyroxeneDelta: 120,
            oneTimeTicketDelta: 2,
            tenTimeTicketDelta: 1,
          },
        ],
        options: {
          ...defaultPyroxenePlannerOptions,
          event: { pickupChance: "ceil" },
          consumption: { apChargeCount: 2, apChargeExceptions: [] },
        },
        collectedSourceKeys: ["source-a", "source-b"],
        eventData: { "event-1": { completed: true, expectedTrials: 200 } },
      },
      eventShops: {
        "event-shop-1": {
          itemQuantities: { "item-1": 3, "item-zero": 0 },
          itemPurchaseDays: { "item-1": 2 },
          selectedBonusStudentUids: ["student-1", "student-1"],
          bonusStudentSelectionMode: "shared",
          selectedBonusStudentUidsByItem: { "item-1": ["student-1", "student-1"] },
          enabledStages: { "stage-1": true },
          includeRecruitedStudents: true,
          existingPaymentItemQuantities: { "currency-1": 7 },
          includeFirstClear: true,
          extraStageRuns: { "stage-1": 2 },
          minigameStartRound: 4,
          minigamePlayCount: 5,
          minigamePaymentQuantityMode: "max",
          cardFlipStrategy: "sr-reset",
          overriddenRequiredQuantities: { "item-1": 11 },
        },
      },
      jankenProgress: {},
      ap: null,
    });
  });

  it("defaults legacy shop rows to all-open when no strategy was persisted", () => {
    const { cardFlipStrategy: _strategy, ...legacyShopRow } = shopRow;
    const document = projectPlannerStateDocument(projectionRows({ eventShops: [legacyShopRow] }));
    expect(document.eventShops["event-shop-1"]?.cardFlipStrategy).toBe("all-open");
  });

  it("keeps input order for records with equal eventAt even when uid order differs", () => {
    const document = projectPlannerStateDocument(
      projectionRows({
        timelineItems: [
          { ...timelineRow, id: 12074, uid: "QSvU46BL::onetime" },
          { ...timelineRow, id: 12076, uid: "EBqd0Ol1::onetime" },
        ],
      }),
    );

    expect(document.pyroxene.records.map(({ uid }) => uid)).toEqual(["QSvU46BL::onetime", "EBqd0Ol1::onetime"]);
  });

  it("projects absent optional sections without hiding malformed stored payloads", () => {
    const empty = projectPlannerStateDocument({
      resources: [],
      timelineItems: [],
      plannerOptions: [],
      collectedSources: [],
      eventData: [],
      eventShops: [],
    });
    expect(empty.pyroxene.options).toEqual(defaultPyroxenePlannerOptions);
    expect(empty.pyroxene.resources).toBeNull();
    expect(empty.ap).toBeNull();

    expect(() =>
      projectPlannerStateDocument(projectionRows({ plannerOptions: [{ userId: 7, options: "{" }] })),
    ).toThrow(PlannerStateProjectionError);
    expect(() =>
      projectPlannerStateDocument(projectionRows({ timelineItems: [{ ...timelineRow, source: "unknown" }] })),
    ).toThrow("pyroxene_timeline_items.source");
    expect(() =>
      projectPlannerStateDocument(
        projectionRows({ eventShops: [{ ...shopRow, selectedBonusStudentUids: "not-an-array" }] }),
      ),
    ).toThrow("event_shop_states.selected_bonus_student_uids");
  });
});

describe("pyroxene recruitment planning fields", () => {
  const baseRows: PlannerStateProjectionRows = {
    resources: [],
    timelineItems: [],
    plannerOptions: [],
    collectedSources: [],
    eventData: [],
    eventShops: [],
  };

  it("keeps entered recruitment stacks and leaves them absent for older snapshots", () => {
    const withStacks = projectPlannerStateDocument({
      ...baseRows,
      resources: [
        {
          inputAt: "2026-11-08T00:00:00.000Z",
          pyroxene: 100,
          oneTimeTicket: 0,
          tenTimeTicket: 0,
          recruitmentStacks: { regular: 40, limited: 120 },
        },
      ],
    });
    expect(withStacks.pyroxene.resources?.recruitmentStacks).toEqual({ regular: 40, limited: 120 });

    const older = projectPlannerStateDocument({
      ...baseRows,
      resources: [{ inputAt: "2026-11-08T00:00:00.000Z", pyroxene: 100, oneTimeTicket: 0, tenTimeTicket: 0 }],
    });
    expect(older.pyroxene.resources).not.toHaveProperty("recruitmentStacks");
  });

  it("rejects stacks outside 0-199", () => {
    expect(() =>
      projectPlannerStateDocument({
        ...baseRows,
        resources: [
          {
            inputAt: "2026-11-08T00:00:00.000Z",
            pyroxene: 0,
            oneTimeTicket: 0,
            tenTimeTicket: 0,
            recruitmentStacks: { regular: 200, limited: 0 },
          },
        ],
      }),
    ).toThrow(PlannerStateProjectionError);
  });

  it("stores the event's own basis and target tiers canonically", () => {
    const document = projectPlannerStateDocument({
      ...baseRows,
      eventData: [
        {
          eventUid: "event-1",
          completed: false,
          expectedTrials: null,
          pickupChance: "ceil",
          targetTiers: { "student-2": 9, "student-1": 3 },
        },
        { eventUid: "event-2", completed: false, expectedTrials: 40, pickupChance: null, targetTiers: {} },
      ],
    });
    expect(document.pyroxene.eventData).toEqual({
      "event-1": { completed: false, expectedTrials: null, pickupChance: "ceil", targetTiers: { "student-2": 9 } },
      "event-2": { completed: false, expectedTrials: 40 },
    });
  });

  it("rejects an unknown basis or tier", () => {
    for (const row of [
      { eventUid: "event-1", completed: false, expectedTrials: null, pickupChance: "lucky" },
      { eventUid: "event-1", completed: false, expectedTrials: null, targetTiers: { "student-1": 10 } },
    ]) {
      expect(() => projectPlannerStateDocument({ ...baseRows, eventData: [row] })).toThrow(PlannerStateProjectionError);
    }
  });

  it("patches one field without dropping the others and removes entries left at defaults", () => {
    const eventData = { "event-1": { completed: false, expectedTrials: 60, targetTiers: { "student-1": 5 as const } } };
    expect(withPyroxeneEventDataPatch(eventData, "event-1", { pickupChance: "average" })["event-1"]).toEqual({
      completed: false,
      expectedTrials: 60,
      pickupChance: "average",
      targetTiers: { "student-1": 5 },
    });
    const cleared = withPyroxeneEventDataPatch(eventData, "event-1", { expectedTrials: null, targetTiers: {} });
    expect(cleared).toEqual({});
  });
});
