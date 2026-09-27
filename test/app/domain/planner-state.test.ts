import { describe, expect, it } from "@jest/globals";
import {
  PlannerStateProjectionError,
  type PlannerStateProjectionRows,
  plannerStateDocumentDifferences,
  projectPlannerStateDocument,
  sortPlannerStateTimelineRecords,
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
  minigamePaymentQuantityMode: "max",
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
          consumption: { apChargeCount: 2 },
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
          overriddenRequiredQuantities: { "item-1": 11 },
        },
      },
      ap: null,
    });
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

  it("reports parity by document section", () => {
    const expected = projectPlannerStateDocument(projectionRows());
    const actual = structuredClone(expected);
    const record = actual.pyroxene.records[0];
    const shop = actual.eventShops["event-shop-1"];
    if (!record || !shop) throw new Error("Expected planner state fixtures are missing");
    record.pyroxeneDelta += 1;
    shop.minigamePlayCount += 1;

    expect(plannerStateDocumentDifferences(expected, actual)).toEqual(["pyroxene.records", "eventShops"]);
    expect(plannerStateDocumentDifferences(expected, null)).toEqual(["document"]);
  });
});
