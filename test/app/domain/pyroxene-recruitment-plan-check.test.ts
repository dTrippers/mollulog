import { describe, expect, it } from "@jest/globals";
import type { PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { getBalanceRange } from "~/domain/pyroxene-planner-view";
import type { RecruitmentOwnedSnapshot } from "~/domain/pyroxene-recruitment-goal";
import {
  buildPlannerEventDataMap,
  buildRecruitmentPlanCheck,
  type RecruitmentPlanCheckInput,
  toPyroxeneCalculationOptions,
} from "~/domain/pyroxene-recruitment-plan-check";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { buildTimeline, type PyroxeneTimelineEventData } from "~/domain/pyroxene-timeline";
import { RecruitmentTypeEnum } from "~/graphql/graphql";

const plannerOptions: PyroxenePlannerOptions = {
  event: { pickupChance: "average" },
  raid: { tier: "platinum" },
  tactical: { level: "over200" },
  consumption: { apChargeCount: 0, apChargeExceptions: [] },
  timeline: { display: [] },
};

const INPUT_AT = "2026-07-01T00:00:00.000Z";
const PICKUP_UID = "student-pickup";

function eventItem(uid: string, since: string, until: string, initialTier = 3): PyroxeneScheduleItem {
  return {
    event: {
      uid,
      name: `${uid} 이벤트`,
      since,
      until,
      earnablePyroxene: null,
      tags: [],
      recruitmentRuleSet: "legacy_points",
      recruitments: [
        {
          recruitmentType: RecruitmentTypeEnum.Usual,
          pickup: true,
          rerun: false,
          until,
          student: { uid: `${PICKUP_UID}-${uid}`, name: `${uid} 학생`, initialTier },
          favorited: true,
        },
      ],
      recruitmentPool: { tier2Count: 150, tier3Count: 202 },
    },
  };
}

const eventA = eventItem("event-a", "2026-07-02T00:00:00.000Z", "2026-07-09T00:00:00.000Z");
const eventB = eventItem("event-b", "2026-07-20T00:00:00.000Z", "2026-07-27T00:00:00.000Z");

function checkInput(overrides: Partial<RecruitmentPlanCheckInput> = {}): RecruitmentPlanCheckInput {
  return {
    now: new Date(INPUT_AT),
    resources: {
      pyroxene: 30_000,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
      inputAt: INPUT_AT,
      recruitmentStacks: { regular: 0, limited: 0 },
    },
    eventDataMap: new Map(),
    scheduleItems: [eventA, eventB],
    options: toPyroxeneCalculationOptions(plannerOptions),
    collectedSourceKeys: [],
    // Read when the resources were entered, before either event begins, with no owned students.
    ownedSnapshot: { readAt: INPUT_AT, states: {} },
    ...overrides,
  };
}

function timelineFor(input: RecruitmentPlanCheckInput) {
  return buildTimeline(
    {
      pyroxene: input.resources.pyroxene,
      oneTimeTicket: input.resources.oneTimeTicket,
      tenTimeTicket: input.resources.tenTimeTicket,
    },
    new Date(input.resources.inputAt ?? INPUT_AT),
    input.eventDataMap,
    input.scheduleItems,
    input.options,
    undefined,
    input.collectedSourceKeys,
    undefined,
    input.resources.recruitmentStacks,
    input.ownedSnapshot,
  );
}

function available(input: RecruitmentPlanCheckInput) {
  const check = buildRecruitmentPlanCheck(input);
  if (check.status !== "available") throw new Error(`expected an available check, got ${check.status}`);
  return check;
}

describe("buildRecruitmentPlanCheck", () => {
  it("asks for input instead of calculating from zero when resources were never entered", () => {
    const input = checkInput();
    expect(buildRecruitmentPlanCheck({ ...input, resources: { ...input.resources, inputAt: null } })).toEqual({
      status: "input_required",
    });
  });

  it("reports the planner timeline's own numbers for each target event", () => {
    const input = checkInput();
    const timeline = timelineFor(input);
    const check = available(input);

    expect(check.events.map((event) => event.eventUid)).toEqual(["event-a", "event-b"]);
    for (const event of check.events) {
      const index = timeline.findIndex(
        (entry) => entry.source.type === "event" && entry.source.event?.uid === event.eventUid,
      );
      const entry = timeline[index];
      const previous = timeline[index - 1];
      if (!entry?.pickupPlan) throw new Error(`missing timeline entry for ${event.eventUid}`);

      expect(event.pulls).toBe(entry.pickupPlan.pulls);
      expect(event.pullRange).toEqual(entry.pickupPlan.pullRange ?? null);
      expect(event.pyroxeneAfter).toBe(entry.accumulatedResources.pyroxene);
      expect(event.pyroxeneAfterRange).toEqual(getBalanceRange(entry));
      // The balance when the event starts is the previous entry's, or the entered resources for the first.
      expect(event.pyroxeneBefore).toBe(previous?.accumulatedResources.pyroxene ?? input.resources.pyroxene);
      expect(event.pyroxeneBeforeRange).toEqual(previous ? getBalanceRange(previous) : null);
      expect(event.spent.pyroxene).toBe(-entry.resourceDelta.pyroxene);
    }
    // The second event carries the first event's spread, so its balance has a range.
    expect(check.events[1]?.pyroxeneBeforeRange).not.toBeNull();
  });

  it("reports a shortfall when the balance after the event is negative", () => {
    const input = checkInput();
    const check = available({ ...input, resources: { ...input.resources, pyroxene: 0 } });
    const first = check.events[0];
    expect(first?.status).toBe("short");
    expect(first?.shortfall).toBe(-(first?.pyroxeneAfter ?? 0));
    expect(first?.surplus).toBe(0);

    const rich = available({ ...input, resources: { ...input.resources, pyroxene: 1_000_000 } }).events[0];
    expect(rich?.status).toBe("enough");
    expect(rich?.shortfall).toBe(0);
    expect(rich?.surplus).toBe(rich?.pyroxeneAfter);
  });

  it("leaves out ended and completed events", () => {
    const ended = available(checkInput({ now: new Date("2026-07-10T00:00:00.000Z") }));
    expect(ended.events.map((event) => event.eventUid)).toEqual(["event-b"]);

    const completed = available(checkInput({ eventDataMap: buildPlannerEventDataMap([], [{ eventUid: "event-a" }]) }));
    expect(completed.events.map((event) => event.eventUid)).toEqual(["event-b"]);
  });

  it("starts targets from the owned state for events that begin after it was read", () => {
    const ownedSnapshot: RecruitmentOwnedSnapshot = {
      readAt: "2026-07-10T00:00:00.000Z",
      states: {
        [`${PICKUP_UID}-event-a`]: { tier: 4, eleph: 50 },
        [`${PICKUP_UID}-event-b`]: { tier: 4, eleph: 50 },
      },
    };
    const eventDataMap = new Map<string, PyroxeneTimelineEventData>([
      ["event-a", { completed: false, expectedTrials: null, targetTiers: { [`${PICKUP_UID}-event-a`]: 9 } }],
      ["event-b", { completed: false, expectedTrials: null, targetTiers: { [`${PICKUP_UID}-event-b`]: 9 } }],
    ]);
    const check = available(checkInput({ eventDataMap, ownedSnapshot }));

    const [before, after] = check.events;
    // event-a began before the owned state was read, so it keeps the unowned start.
    expect(before?.ownedApplied).toBe(false);
    expect(before?.targets).toEqual([
      {
        studentUid: `${PICKUP_UID}-event-a`,
        name: "event-a 학생",
        targetTier: 9,
        owned: null,
        remainingEleph: 720,
        copies: 8,
      },
    ]);
    // Owned ★4 with 50 eleph to ★9 lacks 570 eleph: the first copy gives 200, then four duplicates.
    expect(after?.ownedApplied).toBe(true);
    expect(after?.targets).toEqual([
      {
        studentUid: `${PICKUP_UID}-event-b`,
        name: "event-b 학생",
        targetTier: 9,
        owned: { tier: 4, eleph: 50 },
        remainingEleph: 570,
        copies: 5,
      },
    ]);
  });

  it("passes eleph the account has not entered as null and plans it as none", () => {
    const ownedSnapshot: RecruitmentOwnedSnapshot = {
      readAt: "2026-07-01T00:00:00.000Z",
      states: { [`${PICKUP_UID}-event-b`]: { tier: 4, eleph: null } },
    };
    const eventDataMap = new Map<string, PyroxeneTimelineEventData>([
      ["event-b", { completed: false, expectedTrials: null, targetTiers: { [`${PICKUP_UID}-event-b`]: 9 } }],
    ]);
    const target = available(checkInput({ eventDataMap, ownedSnapshot })).events.find(
      (event) => event.eventUid === "event-b",
    )?.targets[0];
    // Owned ★4 with no eleph to ★9 lacks 620 eleph: the first copy gives 200, then five duplicates.
    expect(target).toMatchObject({ owned: { tier: 4, eleph: null }, remainingEleph: 620, copies: 6 });
  });

  it("does not count eleph for a ★2 target", () => {
    const check = available(
      checkInput({ scheduleItems: [eventItem("event-c", "2026-07-02T00:00:00.000Z", "2026-07-09T00:00:00.000Z", 2)] }),
    );
    expect(check.events[0]?.ownedApplied).toBe(true);
    expect(check.events[0]?.targets[0]).toMatchObject({
      owned: { tier: null, eleph: null },
      remainingEleph: null,
      copies: 1,
    });
  });
});

describe("buildPlannerEventDataMap", () => {
  it("marks completed events and keeps their stored plan", () => {
    const map = buildPlannerEventDataMap(
      [
        { eventUid: "a", expectedTrials: 40, targetTiers: { s: 5 } },
        { eventUid: "b", expectedTrials: null, pickupChance: "ceil" },
      ],
      [{ eventUid: "a" }, { eventUid: "c" }],
    );
    expect(map.get("a")).toEqual({ completed: true, expectedTrials: 40, pickupChance: null, targetTiers: { s: 5 } });
    expect(map.get("b")).toEqual({
      completed: false,
      expectedTrials: null,
      pickupChance: "ceil",
      targetTiers: undefined,
    });
    expect(map.get("c")).toEqual({ completed: true, expectedTrials: null });
  });
});
