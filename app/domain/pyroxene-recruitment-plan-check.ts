import type {
  PyroxeneCalculationOptions,
  PyroxenePickupChance,
  PyroxenePlannerOptions,
} from "~/domain/pyroxene-planner";
import { getBalanceRange, getPyroxeneEventStatus, type PyroxeneEventStatus } from "~/domain/pyroxene-planner-view";
import {
  getRecruitmentRemainingEleph,
  type RecruitmentOwnedSnapshot,
  type RecruitmentOwnedState,
  type RecruitmentStacks,
  type RecruitmentTargetTier,
  type RecruitmentTargetTiers,
} from "~/domain/pyroxene-recruitment-goal";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import {
  buildTimeline,
  getEventOwnedStates,
  getEventPickupTargets,
  getPickupTargetCopyCount,
  getPickupTargetTier,
  type PyroxeneTimelineEventData,
  type TimelinePickupBasis,
} from "~/domain/pyroxene-timeline";
import { toUtcIso, type UtcIsoString } from "~/lib/date-time";
import dayjs from "~/lib/dayjs";

/** A stored per-event planner row, as the planner state keeps it. */
export type PlannerEventDataRow = {
  eventUid: string;
  expectedTrials: number | null;
  pickupChance?: PyroxenePickupChance | null;
  targetTiers?: RecruitmentTargetTiers;
};

/**
 * The per-event data the timeline reads: stored planner rows, with events whose recruitment result is
 * completed marked as completed.
 */
export function buildPlannerEventDataMap(
  rows: readonly PlannerEventDataRow[],
  completions: readonly { eventUid: string }[],
): Map<string, PyroxeneTimelineEventData> {
  const map = new Map<string, PyroxeneTimelineEventData>();
  for (const { eventUid, expectedTrials, pickupChance, targetTiers } of rows) {
    map.set(eventUid, { completed: false, expectedTrials, pickupChance: pickupChance ?? null, targetTiers });
  }
  for (const { eventUid } of completions) {
    map.set(eventUid, { expectedTrials: null, ...map.get(eventUid), completed: true });
  }
  return map;
}

/** The planner options the calculation reads; display options stay out of it. */
export function toPyroxeneCalculationOptions(options: PyroxenePlannerOptions): PyroxeneCalculationOptions {
  return { event: options.event, raid: options.raid, tactical: options.tactical, consumption: options.consumption };
}

export type RecruitmentPlanCheckInput = {
  now: Date;
  resources: {
    pyroxene: number;
    oneTimeTicket: number;
    tenTimeTicket: number;
    // Null when the account has never entered its resources.
    inputAt: string | null;
    recruitmentStacks: RecruitmentStacks;
  };
  eventDataMap: Map<string, PyroxeneTimelineEventData>;
  scheduleItems: PyroxeneScheduleItem[];
  options: PyroxeneCalculationOptions;
  collectedSourceKeys: string[];
  // Null when the owned tiers or held eleph could not be read; every target then starts unowned.
  ownedSnapshot: RecruitmentOwnedSnapshot | null;
};

export type RecruitmentPlanCheckRange = { low: number; high: number };

export type RecruitmentPlanCheckTarget = {
  studentUid: string;
  name: string;
  targetTier: RecruitmentTargetTier;
  // The owned state the plan starts from, or null when owned states do not apply to this event.
  owned: RecruitmentOwnedState | null;
  // Eleph still lacking for the target tier, from the owned state (or ★3 with no eleph when unowned).
  // Null for a student that does not start at ★3, whose growth the plan does not count in eleph.
  remainingEleph: number | null;
  // Copies the plan recruits to reach the target tier.
  copies: number;
};

export type RecruitmentPlanCheckEvent = {
  eventUid: string;
  name: string;
  since: UtcIsoString;
  until: UtcIsoString;
  basis: TimelinePickupBasis;
  basisOverridden: boolean;
  // Paid pulls the plan needs, before free pulls and mileage tickets, and their 10th-90th percentile.
  pulls: number;
  pullRange: RecruitmentPlanCheckRange | null;
  freePulls: number;
  // Expected pyroxene held when the event starts, and its 10th-90th percentile.
  pyroxeneBefore: number;
  pyroxeneBeforeRange: RecruitmentPlanCheckRange | null;
  spent: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number };
  // Expected balance after the event, and its 10th-90th percentile.
  pyroxeneAfter: number;
  pyroxeneAfterRange: RecruitmentPlanCheckRange | null;
  shortfall: number;
  surplus: number;
  status: PyroxeneEventStatus;
  // True when the targets start from the account's owned state instead of unowned.
  ownedApplied: boolean;
  targets: RecruitmentPlanCheckTarget[];
};

export type RecruitmentPlanCheck =
  | { status: "input_required" }
  | {
      status: "available";
      resourcesInputAt: UtcIsoString;
      // False when the owned state could not be read, so every target was counted as unowned.
      ownedStatesAvailable: boolean;
      events: RecruitmentPlanCheckEvent[];
    };

/**
 * Checks each upcoming target event of the plan against the planner timeline: whether the expected pyroxene
 * covers the planned pulls, and by how much it falls short or remains. The numbers are the timeline's own,
 * so they match the planner screen. An account that has never entered its resources needs input first.
 */
export function buildRecruitmentPlanCheck(input: RecruitmentPlanCheckInput): RecruitmentPlanCheck {
  const { resources } = input;
  if (resources.inputAt === null) return { status: "input_required" };

  const ownedSnapshot = input.ownedSnapshot ?? undefined;
  const timeline = buildTimeline(
    { pyroxene: resources.pyroxene, oneTimeTicket: resources.oneTimeTicket, tenTimeTicket: resources.tenTimeTicket },
    new Date(resources.inputAt),
    input.eventDataMap,
    input.scheduleItems,
    input.options,
    undefined,
    input.collectedSourceKeys,
    undefined,
    resources.recruitmentStacks,
    ownedSnapshot,
  );

  const now = dayjs(input.now);
  const seen = new Set<string>();
  const events: RecruitmentPlanCheckEvent[] = [];
  timeline.forEach((entry, index) => {
    const event = entry.source.event;
    const plan = entry.pickupPlan;
    if (entry.source.type !== "event" || !event || !plan) return;
    if (seen.has(event.uid) || !dayjs(event.until).isAfter(now)) return;
    seen.add(event.uid);

    const previous = index > 0 ? timeline[index - 1] : undefined;
    const pyroxeneAfter = entry.accumulatedResources.pyroxene;
    const ownedStates = getEventOwnedStates(event, ownedSnapshot);
    const targetTiers = input.eventDataMap.get(event.uid)?.targetTiers;

    events.push({
      eventUid: event.uid,
      name: event.name,
      since: toUtcIso(event.since),
      until: toUtcIso(event.until),
      basis: plan.basis,
      basisOverridden: plan.basisOverridden,
      pulls: plan.pulls,
      pullRange: plan.pullRange ?? null,
      freePulls: plan.freePulls,
      pyroxeneBefore: pyroxeneAfter - entry.resourceDelta.pyroxene,
      pyroxeneBeforeRange: previous ? getBalanceRange(previous) : null,
      spent: {
        pyroxene: -entry.resourceDelta.pyroxene,
        oneTimeTicket: -entry.resourceDelta.oneTimeTicket,
        tenTimeTicket: -entry.resourceDelta.tenTimeTicket,
      },
      pyroxeneAfter,
      pyroxeneAfterRange: getBalanceRange(entry),
      shortfall: Math.max(0, -pyroxeneAfter),
      surplus: Math.max(0, pyroxeneAfter),
      status: getPyroxeneEventStatus(entry),
      ownedApplied: ownedStates !== undefined,
      targets: getEventPickupTargets(event).flatMap((recruitment) => {
        const student = recruitment.student;
        if (!student) return [];
        const owned = ownedStates ? (ownedStates[student.uid] ?? { tier: null, eleph: 0 }) : null;
        const targetTier = getPickupTargetTier(recruitment, targetTiers);
        return [
          {
            studentUid: student.uid,
            name: student.name,
            targetTier,
            owned,
            remainingEleph:
              (student.initialTier ?? 3) === 3 ? getRecruitmentRemainingEleph(targetTier, owned ?? undefined) : null,
            copies: getPickupTargetCopyCount(recruitment, targetTiers, ownedStates),
          },
        ];
      }),
    });
  });

  return {
    status: "available",
    resourcesInputAt: toUtcIso(resources.inputAt),
    ownedStatesAvailable: input.ownedSnapshot !== null,
    events,
  };
}
