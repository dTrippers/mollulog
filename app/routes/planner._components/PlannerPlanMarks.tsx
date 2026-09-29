import { HeartIcon, ShoppingBagIcon } from "@heroicons/react/16/solid";
import type { PlannerPeriod } from "~/domain/integrated-planner";

export type PlannerPlanMarkState = { recruitment: boolean; shop: boolean };

const RECRUITMENT_ICON_CLASS = "text-rose-500 dark:text-rose-400";
const SHOP_ICON_CLASS = "text-sky-500 dark:text-sky-400";

/** Shop plans attach to the event itself (or its shop period), never to recruitment or raid rows. */
export function plannerPlanMarkState(
  period: PlannerPeriod,
  shopPlannedEventUids: ReadonlySet<string>,
): PlannerPlanMarkState {
  return {
    recruitment: period.hasRecruitmentPlan ?? period.isPlanned === true,
    shop:
      (period.kind === "event" || period.kind === "shop") &&
      Boolean(period.eventUid && shopPlannedEventUids.has(period.eventUid)),
  };
}

export function hasPlannerPlanMark({ recruitment, shop }: PlannerPlanMarkState): boolean {
  return recruitment || shop;
}

export function plannerPlanMarkLabels({ recruitment, shop }: PlannerPlanMarkState): string[] {
  return [...(recruitment ? ["모집 계획"] : []), ...(shop ? ["상점 계획"] : [])];
}

export function PlannerPlanMarks({ state, className = "" }: { state: PlannerPlanMarkState; className?: string }) {
  if (!hasPlannerPlanMark(state)) return null;
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center gap-0.5 ${className}`}>
      {state.recruitment ? <HeartIcon className={`size-3.5 ${RECRUITMENT_ICON_CLASS}`} /> : null}
      {state.shop ? <ShoppingBagIcon className={`size-3.5 ${SHOP_ICON_CLASS}`} /> : null}
    </span>
  );
}

export function PlannerPlanLegend() {
  return (
    <ul aria-label="계획 표시 범례" className="flex items-center gap-3 text-xs text-muted-foreground">
      <li className="inline-flex items-center gap-1">
        <HeartIcon aria-hidden="true" className={`size-3.5 ${RECRUITMENT_ICON_CLASS}`} />
        모집 계획
      </li>
      <li className="inline-flex items-center gap-1">
        <ShoppingBagIcon aria-hidden="true" className={`size-3.5 ${SHOP_ICON_CLASS}`} />
        상점 계획
      </li>
    </ul>
  );
}
