import { describe, expect, it } from "@jest/globals";
import {
  buildPyroxeneAssumptionItems,
  buildPyroxeneCalculationAssumptions,
  getPyroxeneRuleLabel,
  PYROXENE_PICKUP_CHANCE_OPTIONS,
} from "~/domain/pyroxene-assumptions";
import type { PyroxenePickupChance } from "~/domain/pyroxene-planner";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { RecruitmentTypeEnum } from "~/graphql/graphql";

const from = new Date("2026-10-08T00:00:00.000Z");

function pickupRecruitment({
  pickup = true,
  student = { uid: "student-a", name: "학생A", initialTier: 3 },
  recruitmentType = RecruitmentTypeEnum.Usual,
  until = "2026-10-15T00:00:00.000Z",
}: {
  pickup?: boolean;
  student?: NonNullable<PyroxeneScheduleItem["event"]>["recruitments"][number]["student"];
  recruitmentType?: RecruitmentTypeEnum;
  until?: string | null;
} = {}): NonNullable<PyroxeneScheduleItem["event"]>["recruitments"][number] {
  return {
    recruitmentType,
    pickup,
    rerun: false,
    until: until as NonNullable<PyroxeneScheduleItem["event"]>["recruitments"][number]["until"],
    student,
    favorited: true,
  };
}

function eventItem({
  uid,
  name = uid,
  since = "2026-10-09T00:00:00.000Z",
  until = "2026-10-15T00:00:00.000Z",
  recruitmentRuleSet,
  recruitments = [pickupRecruitment()],
  tags = [],
}: {
  uid: string;
  name?: string;
  since?: string;
  until?: string;
  recruitmentRuleSet?: NonNullable<PyroxeneScheduleItem["event"]>["recruitmentRuleSet"];
  recruitments?: NonNullable<PyroxeneScheduleItem["event"]>["recruitments"];
  tags?: string[];
}): PyroxeneScheduleItem {
  return {
    event: {
      uid,
      name,
      since: new Date(since),
      until: new Date(until),
      earnablePyroxene: null,
      tags,
      recruitmentRuleSet,
      recruitments,
    },
  };
}

function assumptionsFor(scheduleItems: PyroxeneScheduleItem[], pickupChance: PyroxenePickupChance = "average_pity") {
  return buildPyroxeneCalculationAssumptions(scheduleItems, pickupChance, from);
}

describe("buildPyroxeneCalculationAssumptions", () => {
  it("detects legacy and rework rules, defaulting an omitted rule set to legacy", () => {
    expect(assumptionsFor([eventItem({ uid: "legacy" })]).recruitmentRule).toEqual({ kind: "legacy" });
    expect(
      assumptionsFor([eventItem({ uid: "rework", recruitmentRuleSet: "call_charge_v1" })]).recruitmentRule,
    ).toEqual({ kind: "rework" });
  });

  it("reports a mixed rule and names the earliest rework event", () => {
    const assumptions = assumptionsFor([
      eventItem({
        uid: "late",
        name: "늦은 개편",
        since: "2026-10-20T00:00:00.000Z",
        recruitmentRuleSet: "call_charge_v1",
      }),
      eventItem({ uid: "legacy" }),
      eventItem({
        uid: "early",
        name: "빠른 개편",
        since: "2026-10-10T00:00:00.000Z",
        recruitmentRuleSet: "call_charge_v1",
      }),
    ]);

    expect(assumptions.recruitmentRule).toEqual({ kind: "mixed", firstReworkEventName: "빠른 개편" });
  });

  it("returns no rule for schedules without an eligible upcoming pickup event", () => {
    const assumptions = assumptionsFor([
      eventItem({
        uid: "not-a-pickup",
        recruitments: [pickupRecruitment({ pickup: false })],
        recruitmentRuleSet: "call_charge_v1",
      }),
      eventItem({
        uid: "without-student",
        recruitments: [pickupRecruitment({ student: null })],
        recruitmentRuleSet: "call_charge_v1",
      }),
      eventItem({
        uid: "given",
        recruitments: [pickupRecruitment({ recruitmentType: RecruitmentTypeEnum.Given })],
        recruitmentRuleSet: "call_charge_v1",
      }),
      eventItem({
        uid: "ended",
        until: "2026-10-07T23:59:59.999Z",
        recruitmentRuleSet: "call_charge_v1",
      }),
      {
        raid: {
          uid: "raid",
          type: "total_assault",
          name: "레이드",
          since: new Date("2026-10-09T00:00:00.000Z"),
          until: new Date("2026-10-15T00:00:00.000Z"),
        },
      },
    ]);

    expect(assumptions.recruitmentRule).toEqual({ kind: "none" });
  });

  it("excludes events that ended before the display start when deciding the rule", () => {
    const assumptions = assumptionsFor([
      eventItem({
        uid: "ended-rework",
        until: "2026-10-07T23:59:59.999Z",
        recruitmentRuleSet: "call_charge_v1",
      }),
      eventItem({ uid: "current-legacy" }),
    ]);

    expect(assumptions.recruitmentRule).toEqual({ kind: "legacy" });
  });

  it("sets perk, free-recruitment, and range flags from the target event and goal mode", () => {
    const event = eventItem({ uid: "rework-free", recruitmentRuleSet: "call_charge_v1", tags: ["recruit_free_100"] });

    expect(assumptionsFor([event], "average")).toMatchObject({
      pickupChance: "average",
      showsRange: true,
      recruitmentPerks: true,
      freeRecruitment: true,
    });
    expect(assumptionsFor([event], "average_pity").showsRange).toBe(true);
    expect(assumptionsFor([event], "ceil").showsRange).toBe(false);
    expect(assumptionsFor([eventItem({ uid: "legacy" })])).toMatchObject({
      recruitmentPerks: false,
      freeRecruitment: false,
    });
  });
});

describe("buildPyroxeneAssumptionItems", () => {
  it("shows the correct recruitment-rule wording and only the goal when no event applies", () => {
    const ruleCases = [
      { recruitmentRule: { kind: "rework" as const }, label: "모집 개편 반영" },
      { recruitmentRule: { kind: "mixed" as const, firstReworkEventName: "이벤트" }, label: "모집 개편 반영" },
      { recruitmentRule: { kind: "legacy" as const }, label: "모집 개편 전 규칙" },
    ];

    for (const { recruitmentRule, label } of ruleCases) {
      expect(
        buildPyroxeneAssumptionItems({
          recruitmentRule,
          pickupChance: "average_pity",
          showsRange: true,
          recruitmentPerks: false,
          freeRecruitment: false,
        })[0],
      ).toEqual({ id: "rule", label });
      expect(getPyroxeneRuleLabel(recruitmentRule)).toBe(label);
    }

    const noRule = {
      recruitmentRule: { kind: "none" as const },
      pickupChance: "average_pity" as const,
      showsRange: true,
      recruitmentPerks: false,
      freeRecruitment: false,
    };
    expect(getPyroxeneRuleLabel(noRule.recruitmentRule)).toBeNull();
    expect(buildPyroxeneAssumptionItems(noRule)).toEqual([{ id: "goal", label: "계산 기준: 평균 (천장 반영)" }]);
  });

  it("uses the exact goal text for all three modes without chips or separators", () => {
    const expected = [
      ["average", "계산 기준: 평균 (천장 미반영)"],
      ["average_pity", "계산 기준: 평균 (천장 반영)"],
      ["ceil", "계산 기준: 천장"],
    ] as const;

    for (const [pickupChance, label] of expected) {
      const items = buildPyroxeneAssumptionItems({
        recruitmentRule: { kind: "none" },
        pickupChance,
        showsRange: pickupChance !== "ceil",
        recruitmentPerks: false,
        freeRecruitment: false,
      });
      expect(items).toEqual([{ id: "goal", label }]);
      expect(items.map(({ label: itemLabel }) => itemLabel).join(" ")).not.toMatch(/[차지·]/);
    }
  });

  it("shares concise mode descriptions between the settings panel and the method sheet", () => {
    expect(PYROXENE_PICKUP_CHANCE_OPTIONS.map(({ description }) => description)).toEqual([
      "픽업 확률만으로 계산한 평균 모집 횟수를 써요.",
      "천장까지 고려한 평균 모집 횟수를 써요.",
      "모든 픽업 학생을 천장까지 모집하는 경우를 기준으로 계산해요.",
    ]);
  });
});
