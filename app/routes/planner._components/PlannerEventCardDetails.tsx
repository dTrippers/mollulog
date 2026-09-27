import type { PlannerPeriod, PlannerScheduleFact } from "~/domain/integrated-planner";
import {
  formatPlannerPeriodRangeParts,
  plannerPeriodBoldEndpoint,
  plannerPeriodRangeLabel,
  plannerPeriodsShareRange,
} from "~/domain/integrated-planner";
import {
  PlannerEventCardActions,
  type PlannerEventCardRecruitmentAction,
  PlannerPeriodRange,
  PlannerRecruitmentRow,
} from "./PlannerCalendarParts";

type PlannerEventShopPlan = {
  timelineUid: string;
};

export default function PlannerEventCardDetails({
  eventPeriod,
  shopPeriod,
  recruitmentPeriods,
  shopPlans,
  facts,
  timeZone,
  onAddRecruitment,
  onEditRecruitment,
}: {
  eventPeriod?: PlannerPeriod;
  shopPeriod?: PlannerPeriod;
  recruitmentPeriods: readonly PlannerPeriod[];
  shopPlans: readonly PlannerEventShopPlan[];
  facts: readonly PlannerScheduleFact[];
  timeZone: string;
  onAddRecruitment: (eventUid: string, focusKey: string) => void;
  onEditRecruitment: (eventUid: string, focusKey: string) => void;
}) {
  const eventUid = eventPeriod?.eventUid ?? shopPeriod?.eventUid ?? recruitmentPeriods[0]?.eventUid;
  const eventShopPlans = eventUid ? shopPlans.filter((plan) => plan.timelineUid === eventUid) : [];
  const shopCalculatorHref =
    shopPeriod?.href ??
    (eventShopPlans.length > 0 && eventUid ? `/events/${encodeURIComponent(eventUid)}/shop` : undefined);
  const recruitmentFocusPrefix = `planner-event-recruitment-${eventUid ?? eventPeriod?.key ?? "date"}`;
  const firstUnplannedRecruitmentKey = recruitmentPeriods.find((period) => !period.hasRecruitmentPlan)?.key;

  const recruitmentActions: PlannerEventCardRecruitmentAction[] = recruitmentPeriods.flatMap((period) => {
    const isPlanned = period.hasRecruitmentPlan === true;
    const isFirstUnplanned = period.key === firstUnplannedRecruitmentKey;
    if (!isPlanned && !isFirstUnplanned) return [];
    const focusKey = `${recruitmentFocusPrefix}-${period.key}`;
    return [
      {
        key: period.key,
        text: isPlanned ? "관심 학생 수정" : "모집 계획 추가",
        focusKey,
        onClick: () => {
          if (!eventUid) return;
          if (isPlanned) onEditRecruitment(eventUid, focusKey);
          else onAddRecruitment(eventUid, focusKey);
        },
      },
    ];
  });

  return (
    <div className="space-y-3">
      <PlannerEventCardActions
        eventPeriod={eventPeriod?.kind === "event" ? eventPeriod : undefined}
        shopCalculatorHref={shopCalculatorHref}
        recruitmentActions={recruitmentActions}
      />

      {recruitmentPeriods.length > 0 ? (
        <ul className="space-y-2">
          {recruitmentPeriods.map((period) => {
            const sameAsEvent = eventPeriod ? plannerPeriodsShareRange(period, eventPeriod) : false;
            const rangeParts = sameAsEvent
              ? null
              : formatPlannerPeriodRangeParts(period.startAt, period.endAt, timeZone);
            const boldEndpoint = rangeParts
              ? plannerPeriodBoldEndpoint(facts, "recruitment-start", "recruitment-end", {
                  startAt: period.startAt,
                  endAt: period.endAt,
                })
              : null;
            const students = period.students ?? [];
            return (
              <li key={period.key}>
                <PlannerRecruitmentRow
                  students={students}
                  periodRange={
                    rangeParts ? (
                      <>
                        모집 <PlannerPeriodRange parts={rangeParts} boldEndpoint={boldEndpoint} />
                      </>
                    ) : undefined
                  }
                  accessiblePeriodRange={rangeParts ? `모집 ${plannerPeriodRangeLabel(rangeParts)}` : undefined}
                  showEmptyStudentText={false}
                  favoriteMarker={period.hasRecruitmentPlan === true && students.length > 0}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
