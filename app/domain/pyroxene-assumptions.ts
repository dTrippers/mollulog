import type { PyroxenePickupChance } from "~/domain/pyroxene-planner";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { isFreeRecruitment100Event } from "~/domain/pyroxene-timeline";
import { getRecruitmentChargeScope, RECRUITMENT_PERK_TEN_PULL_THRESHOLDS } from "~/domain/recruitment-cost";
import dayjs from "~/lib/dayjs";

export const PYROXENE_PICKUP_CHANCE_OPTIONS = [
  {
    label: "평균 (천장 미반영)",
    value: "average",
    description: "픽업 확률만으로 계산한 평균 모집 횟수를 써요.",
  },
  {
    label: "평균 (천장 반영)",
    value: "average_pity",
    description: "천장까지 고려한 평균 모집 횟수를 써요.",
  },
  {
    label: "천장",
    value: "ceil",
    description: "모든 픽업 학생을 천장까지 모집하는 경우를 기준으로 계산해요.",
  },
] satisfies { label: string; value: PyroxenePickupChance; description: string }[];

export type PyroxeneRecruitmentRule =
  | { kind: "none" }
  | { kind: "legacy" }
  | { kind: "rework" }
  | { kind: "mixed"; firstReworkEventName: string };

export type PyroxeneCalculationAssumptions = {
  recruitmentRule: PyroxeneRecruitmentRule;
  pickupChance: PyroxenePickupChance;
  showsRange: boolean;
  recruitmentPerks: boolean;
  freeRecruitment: boolean;
};

export type PyroxeneAssumptionItem = {
  id: "rule" | "goal";
  label: string;
};

export function buildPyroxeneCalculationAssumptions(
  scheduleItems: PyroxeneScheduleItem[],
  pickupChance: PyroxenePickupChance,
  from: Date,
): PyroxeneCalculationAssumptions {
  const displayStart = dayjs(from);
  const targetEvents = scheduleItems.flatMap((item) => {
    const event = item.event;
    if (
      !event?.recruitments.some(
        ({ pickup, student, recruitmentType }) => pickup && student && recruitmentType !== "given",
      ) ||
      !dayjs(event.until).isAfter(displayStart)
    ) {
      return [];
    }
    return [event];
  });

  const reworkEvents = targetEvents
    .filter((event) => (event.recruitmentRuleSet ?? "legacy_points") === "call_charge_v1")
    .sort((left, right) => dayjs(left.since).valueOf() - dayjs(right.since).valueOf());
  const hasLegacyEvent = targetEvents.some(
    (event) => (event.recruitmentRuleSet ?? "legacy_points") === "legacy_points",
  );
  const hasReworkEvent = reworkEvents.length > 0;

  let recruitmentRule: PyroxeneRecruitmentRule;
  if (hasLegacyEvent && hasReworkEvent) {
    recruitmentRule = { kind: "mixed", firstReworkEventName: reworkEvents[0].name };
  } else if (hasReworkEvent) {
    recruitmentRule = { kind: "rework" };
  } else if (hasLegacyEvent) {
    recruitmentRule = { kind: "legacy" };
  } else {
    recruitmentRule = { kind: "none" };
  }

  return {
    recruitmentRule,
    pickupChance,
    showsRange: pickupChance !== "ceil",
    recruitmentPerks: targetEvents.some(
      (event) =>
        event.recruitmentRuleSet === "call_charge_v1" &&
        event.recruitments.some(
          ({ pickup, recruitmentType }) => pickup && getRecruitmentChargeScope(recruitmentType) !== null,
        ),
    ),
    freeRecruitment: targetEvents.some((event) => isFreeRecruitment100Event(event, displayStart)),
  };
}

export function getPyroxeneRuleLabel(rule: PyroxeneRecruitmentRule): string | null {
  if (rule.kind === "none") return null;
  return rule.kind === "legacy" ? "모집 개편 전 규칙" : "모집 개편 반영";
}

export function buildPyroxeneAssumptionItems(assumptions: PyroxeneCalculationAssumptions): PyroxeneAssumptionItem[] {
  const items: PyroxeneAssumptionItem[] = [];
  const ruleLabel = getPyroxeneRuleLabel(assumptions.recruitmentRule);
  if (ruleLabel) items.push({ id: "rule", label: ruleLabel });
  const pickupChanceLabel =
    PYROXENE_PICKUP_CHANCE_OPTIONS.find(({ value }) => value === assumptions.pickupChance)?.label ??
    PYROXENE_PICKUP_CHANCE_OPTIONS[0].label;
  items.push({ id: "goal", label: `계산 기준: ${pickupChanceLabel}` });
  return items;
}

export { RECRUITMENT_PERK_TEN_PULL_THRESHOLDS };
