import { StarIcon } from "@heroicons/react/16/solid";
import { useEffect, useRef } from "react";
import { Button } from "~/components/primitives";
import {
  formatPlannerPeriodPoint,
  formatPlannerPeriodRangeParts,
  type PlannerDateScheduleItem,
  type PlannerDayResources,
  type PlannerPeriod,
  type PlannerScheduleFact,
  plannerPeriodBoldEndpoint,
  plannerPeriodRangeLabel,
} from "~/domain/integrated-planner";
import { PlannerEventThumbnail, PlannerPeriodRange } from "./PlannerCalendarParts";
import { DailyResourceChanges, formatSignedQuantity, RESOURCE_PRESENTATION } from "./PlannerCalendarWeek";
import PlannerEventCardDetails from "./PlannerEventCardDetails";

type PlannerDateScheduleShopPlan = {
  timelineUid: string;
};

function runTypeLabel(period?: PlannerPeriod): string | null {
  if (period?.runType === "first") return "최초";
  if (period?.runType === "rerun") return "복각";
  if (period?.runType === "permanent") return "상설";
  return null;
}

function labelForPeriod(period: PlannerPeriod): string | null {
  if (period.kind === "recruitment") return "모집";
  if (period.kind === "raid") return period.raidType === "elimination" ? "대결전" : "총력전";
  return null;
}

/** The row's own period range endpoints + which fact kinds mark "today" for bolding. */
function rowRangeFactKinds(
  period: PlannerPeriod,
): { startKind: PlannerScheduleFact["kind"] | null; endKind: PlannerScheduleFact["kind"] } | null {
  if (period.kind === "event") return { startKind: "event-start", endKind: "event-end" };
  if (period.kind === "raid") return { startKind: "raid-start", endKind: "raid-end" };
  if (period.kind === "recruitment") return { startKind: "recruitment-start", endKind: "recruitment-end" };
  // A shop period has no "start" fact kind (only its deadline is ever marked); a null startKind
  // means that endpoint is simply never bolded, per plannerPeriodBoldEndpoint's semantics.
  if (period.kind === "shop") return { startKind: null, endKind: "shop-deadline" };
  return null;
}

function raidPointFactLabel(fact: PlannerScheduleFact, timeZone: string): string | null {
  const point = formatPlannerPeriodPoint(fact.at, timeZone);
  if (fact.kind === "raid-reward") return `보상 지급 ${point}`;
  if (fact.kind === "raid-ticket-expiry") return `10회 모집 티켓 만료 ${point}`;
  return null;
}

function accessibleName(
  item: PlannerDateScheduleItem,
  rangeLabel: string | null,
  raidPointLabels: readonly string[],
  recruitmentStudentNames: readonly string[],
  selected: boolean,
  changes: PlannerDayResources["changes"],
) {
  const titleLabel = labelForPeriod(item.period);
  const resourceText = changes.map(
    (change) => `${RESOURCE_PRESENTATION[change.key].label} ${formatSignedQuantity(change.quantity)}`,
  );
  const typePrefix = item.period.kind === "event" ? runTypeLabel(item.period) : null;
  return [
    ...(selected ? ["선택한 일정"] : []),
    ...(titleLabel ? [titleLabel] : []),
    item.period.name,
    ...(item.period.isPlanned ? ["내 계획"] : []),
    ...(typePrefix ? [typePrefix] : []),
    ...(rangeLabel ? [rangeLabel] : []),
    ...raidPointLabels,
    ...(recruitmentStudentNames.length > 0 ? [recruitmentStudentNames.join(", ")] : []),
    ...resourceText,
  ].join(", ");
}

export default function PlannerDateScheduleRow({
  item,
  allPeriods,
  timeZone,
  shopPlans,
  resourceChanges = [],
  showResourceChanges,
  highlighted,
  focusOnMount,
  onHighlightedFocusComplete,
  onAddRecruitment,
  onEditRecruitment,
}: {
  item: PlannerDateScheduleItem;
  allPeriods: readonly PlannerPeriod[];
  timeZone: string;
  shopPlans: readonly PlannerDateScheduleShopPlan[];
  resourceChanges?: PlannerDayResources["changes"];
  showResourceChanges: boolean;
  highlighted: boolean;
  focusOnMount: boolean;
  onHighlightedFocusComplete: () => void;
  onAddRecruitment: (eventUid: string, focusKey: string) => void;
  onEditRecruitment: (eventUid: string, focusKey: string) => void;
}) {
  const { period } = item;
  const eventPeriod =
    period.kind === "event"
      ? period
      : (item.eventPeriod ??
        (period.eventUid
          ? allPeriods.find((candidate) => candidate.kind === "event" && candidate.eventUid === period.eventUid)
          : undefined));
  const shopPeriod =
    item.shopPeriod ??
    (period.kind === "shop"
      ? period
      : period.eventUid
        ? allPeriods.find((candidate) => candidate.kind === "shop" && candidate.eventUid === period.eventUid)
        : undefined);
  const recruitmentPeriods =
    item.recruitmentPeriods ??
    (period.kind === "recruitment"
      ? [period]
      : // The domain always sets recruitmentPeriods (already end-date filtered) for event and shop
        // items; this unfiltered fallback exists only for other period kinds and must never apply
        // to a shop period, or an already-ended recruitment could reappear on its own card.
        period.eventUid && period.kind !== "shop"
        ? allPeriods.filter((candidate) => candidate.kind === "recruitment" && candidate.eventUid === period.eventUid)
        : []);
  const recruitmentStudentNames = recruitmentPeriods
    .flatMap((recruitment) => recruitment.students ?? [])
    .filter((student, index, students) => students.findIndex((candidate) => candidate.uid === student.uid) === index)
    .map(({ name }) => name);

  const rangeKinds = rowRangeFactKinds(period);
  const rangeParts = formatPlannerPeriodRangeParts(period.startAt, period.endAt, timeZone);
  const boldEndpoint = rangeKinds
    ? plannerPeriodBoldEndpoint(item.facts, rangeKinds.startKind, rangeKinds.endKind)
    : null;
  const rangeLabel = rangeParts ? plannerPeriodRangeLabel(rangeParts) : null;
  const typePrefix = period.kind === "event" ? runTypeLabel(eventPeriod) : null;
  const raidPointFacts =
    period.kind === "raid"
      ? item.facts.filter((fact) => fact.kind === "raid-reward" || fact.kind === "raid-ticket-expiry")
      : [];
  const raidPointLabels = raidPointFacts
    .map((fact) => raidPointFactLabel(fact, timeZone))
    .filter((label): label is string => label !== null);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const typeLabel = labelForPeriod(period);
  const articleLabel = accessibleName(
    item,
    rangeLabel,
    raidPointLabels,
    recruitmentStudentNames,
    highlighted,
    resourceChanges,
  );

  useEffect(() => {
    if (!focusOnMount) return;
    const frame = requestAnimationFrame(() => {
      titleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      titleRef.current?.focus({ preventScroll: true });
      onHighlightedFocusComplete();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusOnMount, onHighlightedFocusComplete]);

  return (
    <article
      aria-label={articleLabel}
      className={`-mx-2 -my-2 rounded-md p-2 ${highlighted ? "bg-muted/60" : ""}`}
      data-planner-schedule-item={item.key}
    >
      <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-x-2">
        <PlannerEventThumbnail period={period.kind === "raid" ? period : (eventPeriod ?? period)} />
        <div className="min-w-0">
          <h3
            ref={titleRef}
            tabIndex={highlighted ? -1 : undefined}
            aria-label={articleLabel}
            className="line-clamp-2 break-keep text-sm font-medium text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {period.isPlanned ? (
              <StarIcon
                aria-hidden="true"
                className="mr-1 inline size-4 align-[-2px] text-amber-700 dark:text-amber-400"
              />
            ) : null}
            {typeLabel ? <span className="mr-1 text-muted-foreground">{typeLabel} ·</span> : null}
            {period.name}
          </h3>
          {rangeParts ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {typePrefix ? <span className="mr-1 whitespace-nowrap">{typePrefix} ·</span> : null}
              <PlannerPeriodRange parts={rangeParts} boldEndpoint={boldEndpoint} />
            </p>
          ) : null}
          {raidPointLabels.map((label, index) => (
            <p key={raidPointFacts[index].kind} className="mt-0.5 text-xs font-semibold text-foreground">
              {label}
            </p>
          ))}
        </div>
        {showResourceChanges && resourceChanges.length > 0 ? (
          <div className="min-w-0 justify-self-end">
            <DailyResourceChanges changes={resourceChanges} />
          </div>
        ) : null}
      </div>

      {period.kind === "raid" ? (
        period.href && period.seasonIndex != null ? (
          <div className="mt-3 pl-0 min-[360px]:pl-[3rem]">
            <Button text="레이드 정보" to={period.href} size="xs" variant="secondary" />
          </div>
        ) : null
      ) : (
        <div className="mt-3 pl-0 min-[360px]:pl-[3rem]">
          <PlannerEventCardDetails
            eventPeriod={eventPeriod}
            shopPeriod={shopPeriod}
            recruitmentPeriods={recruitmentPeriods}
            shopPlans={shopPlans}
            facts={item.facts}
            timeZone={timeZone}
            onAddRecruitment={onAddRecruitment}
            onEditRecruitment={onEditRecruitment}
          />
        </div>
      )}
    </article>
  );
}
