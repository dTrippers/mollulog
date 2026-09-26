import type { ReactNode } from "react";
import type { PlannerPeriod } from "~/domain/integrated-planner";
import { formatInstant } from "~/lib/date-time";
import {
  PlannerEventCardActions,
  PlannerEventDates,
  PlannerEventThumbnail,
  PlannerRecruitmentRow,
} from "./PlannerCalendarParts";

type PlannerEventShopPlan = {
  timelineUid: string;
  shopStateUid: string | null;
  name: string;
  state: unknown | null;
  defaultState: unknown | null;
};

function recruitmentRange(period: PlannerPeriod, timeZone: string): ReactNode {
  if (period.startAt && period.endAt) {
    return (
      <>
        <span className="whitespace-nowrap">{formatInstant(period.startAt, { timeZone, format: "M/D HH:mm" })}</span> –{" "}
        <span className="whitespace-nowrap">{formatInstant(period.endAt, { timeZone, format: "M/D HH:mm" })}</span>
      </>
    );
  }
  return (
    <>
      <span className="whitespace-nowrap">{period.startDate}</span> –{" "}
      <span className="whitespace-nowrap">{period.endDate}</span>
    </>
  );
}

export default function PlannerEventSubview({
  eventPeriod,
  shopPeriod,
  periods,
  shopPlans,
  recruitmentStatus,
  recruitmentUnavailable,
  referenceDateKey,
  timeZone,
  onAddRecruitment,
  onEditRecruitment,
  onEditShop,
}: {
  eventPeriod: PlannerPeriod;
  shopPeriod?: PlannerPeriod;
  periods: readonly PlannerPeriod[];
  shopPlans: readonly PlannerEventShopPlan[];
  recruitmentStatus: string;
  recruitmentUnavailable: boolean;
  referenceDateKey: string;
  timeZone: string;
  onAddRecruitment: (focusKey: string) => void;
  onEditRecruitment: (focusKey: string) => void;
  onEditShop: (focusKey?: string) => void;
}) {
  const recruitmentPeriods = periods.filter(
    (period) => period.kind === "recruitment" && period.eventUid === eventPeriod.eventUid,
  );
  const firstUnplannedRecruitmentKey = recruitmentPeriods.find((period) => !period.hasRecruitmentPlan)?.key;
  const eventShopPlans = shopPlans.filter((plan) => plan.timelineUid === eventPeriod.eventUid);
  const editableShopPlans = eventShopPlans.filter(
    (plan) => plan.shopStateUid !== null && plan.state !== null && plan.defaultState !== null,
  );
  const shopCalculatorHref =
    shopPeriod?.href ??
    (eventShopPlans.length > 0 && eventPeriod.eventUid
      ? `/events/${encodeURIComponent(eventPeriod.eventUid)}/shop`
      : undefined);
  const shopEditFocusKey = `planner-event-shop-edit-${eventPeriod.eventUid ?? eventPeriod.key}`;
  const addRecruitmentFocusKey = `planner-event-recruitment-add-${eventPeriod.eventUid ?? eventPeriod.key}`;
  const editRecruitmentFocusKey = `planner-event-recruitment-edit-${eventPeriod.eventUid ?? eventPeriod.key}`;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-2">
        <div className="row-span-2">
          <PlannerEventThumbnail period={eventPeriod} />
        </div>
        <div className="min-w-0">
          <PlannerEventDates
            eventPeriod={eventPeriod}
            shopPeriod={shopPeriod}
            referenceDateKey={referenceDateKey}
            timeZone={timeZone}
          />
          {recruitmentPeriods.length > 0 ? (
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
              {recruitmentPeriods.map((period) => (
                <div key={period.key} className="contents">
                  <dt className="text-muted-foreground">모집</dt>
                  <dd className="min-w-0 tabular-nums">{recruitmentRange(period, timeZone)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        <PlannerEventCardActions
          eventPeriod={eventPeriod}
          shopCalculatorHref={shopCalculatorHref}
          editableShopPlans={editableShopPlans}
          shopEditFocusKey={shopEditFocusKey}
          onEditShop={() => onEditShop(shopEditFocusKey)}
          className="col-span-2 min-[360px]:col-start-2 min-[360px]:col-span-1"
        />
      </div>

      {recruitmentPeriods.length > 0 || recruitmentUnavailable ? (
        <section aria-labelledby="planner-event-recruitment-title" className="space-y-3">
          <h3 id="planner-event-recruitment-title" className="text-base font-semibold">
            모집
          </h3>
          <ul className="space-y-3">
            {recruitmentPeriods.map((period) => {
              const isPlanned = period.hasRecruitmentPlan === true;
              const isFirstUnplanned = period.key === firstUnplannedRecruitmentKey;
              return (
                <li key={period.key}>
                  <PlannerRecruitmentRow
                    students={period.students ?? []}
                    status={isPlanned ? recruitmentStatus : "모집"}
                    deadline={recruitmentRange(period, timeZone)}
                    actionText={isPlanned ? "모집 수정" : isFirstUnplanned ? "모집 계획 추가" : undefined}
                    actionFocusKey={
                      isPlanned ? editRecruitmentFocusKey : isFirstUnplanned ? addRecruitmentFocusKey : undefined
                    }
                    onAction={
                      isPlanned
                        ? () => onEditRecruitment(editRecruitmentFocusKey)
                        : isFirstUnplanned
                          ? () => onAddRecruitment(addRecruitmentFocusKey)
                          : undefined
                    }
                    showEmptyStudentText={false}
                  />
                </li>
              );
            })}
            {recruitmentUnavailable ? (
              <li className="text-sm text-muted-foreground">일정 정보를 확인할 수 없어요.</li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
