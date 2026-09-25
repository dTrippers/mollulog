import { BoltIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import { useMemo, useState } from "react";
import {
  convertClueSearchCostsToPoints,
  filterClueSearchShopResources,
  resolveClueSearchExchange,
} from "~/components/features/events/shop/clue-search";
import { useBonusCalculation, useShopCalculations } from "~/components/features/events/shop/hooks";
import { calculateMinigamePaymentCosts } from "~/components/features/events/shop/utils";
import { type EventShopState, eventShopStatesEqual } from "~/domain/event-shop-state";
import type { PlannerShopContent } from "./PlannerShopOwnedQuantityEditor";

export type PlannerShopSummaryProps = {
  content: PlannerShopContent | null;
  state: EventShopState;
  defaultState: EventShopState;
  headingId: string;
};

function formatAp(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function PlannerShopSummary({ content, state, defaultState, headingId }: PlannerShopSummaryProps) {
  const stages = content?.stages ?? [];
  const shopResources = content?.shopResources ?? [];
  const eventRewardBonus = content?.eventRewardBonus ?? [];
  const minigameConfig = content?.minigameConfig ?? null;

  const clueSearchExchange = useMemo(
    () => resolveClueSearchExchange(minigameConfig, shopResources),
    [minigameConfig, shopResources],
  );
  const visibleShopResources = useMemo(
    () => filterClueSearchShopResources(shopResources, clueSearchExchange),
    [clueSearchExchange, shopResources],
  );
  const { appliedBonusRatios } = useBonusCalculation({
    eventRewardBonus,
    selectedStudentUids: state.selectedBonusStudentUids,
    selectedStudentUidsByItem:
      state.bonusStudentSelectionMode === "perItem" ? state.selectedBonusStudentUidsByItem : undefined,
  });
  const minigamePaymentCosts = useMemo(() => {
    if (!minigameConfig) return undefined;
    const costs = calculateMinigamePaymentCosts(
      minigameConfig,
      state.minigamePlayCount,
      state.minigamePaymentQuantityMode,
      state.minigameStartRound,
    );
    return minigameConfig.minigameType === "clue_search"
      ? convertClueSearchCostsToPoints(costs, clueSearchExchange)
      : costs;
  }, [
    clueSearchExchange,
    minigameConfig,
    state.minigamePaymentQuantityMode,
    state.minigamePlayCount,
    state.minigameStartRound,
  ]);
  const calculation = useShopCalculations({
    state,
    stages,
    shopResources: visibleShopResources,
    appliedBonusRatio: appliedBonusRatios,
    minigamePaymentCosts,
    excludedShopResourceUids: clueSearchExchange?.hiddenShopResourceUids,
    minigameConfig,
  });

  const hasUnobtainableTargets = Object.keys(calculation.unobtainableTargets).length > 0;
  const hasPlanInput = !eventShopStatesEqual(state, defaultState);
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = `${headingId}-details`;

  return (
    <section className="space-y-2">
      {!content ? (
        <p className="text-sm text-muted-foreground">이벤트 상점 계산 정보를 확인할 수 없어요.</p>
      ) : !hasPlanInput ? (
        <p className="text-sm text-muted-foreground">
          아직 입력된 상점 계획이 없어요. 상점 계산기에서 목표를 입력해주세요.
        </p>
      ) : !calculation.isReady ? (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {calculation.isCalculating ? "소탕 횟수와 필요 AP를 계산하고 있어요…" : "소탕 계산 결과를 준비하고 있어요…"}
        </p>
      ) : hasUnobtainableTargets ? (
        <div className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md py-1 text-left">
          <span className="text-sm font-medium text-foreground">남은 필요 AP</span>
          <span className="shrink-0 text-base font-semibold tabular-nums text-foreground">확인 필요</span>
        </div>
      ) : (
        <>
          <button
            id={headingId}
            type="button"
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">남은 필요 AP</span>
              <span className="block text-xs text-muted-foreground">현재 입력 기준</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 font-semibold tabular-nums text-foreground">
              <BoltIcon aria-hidden="true" className="size-4 text-green-600 dark:text-green-400" />
              <span className="text-base">{formatAp(calculation.totalApWithExtras)} AP</span>
              <ChevronDownIcon
                aria-hidden="true"
                className={`size-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
              />
            </span>
          </button>

          <div id={detailsId} hidden={!isExpanded} className="space-y-1 px-3">
            <div className="flex min-h-7 items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">스토리 / 초회</span>
              <span className="tabular-nums text-foreground">{formatAp(calculation.firstClearAp)} AP</span>
            </div>
            <div className="flex min-h-7 items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">계산 소탕</span>
              <span className="tabular-nums text-foreground">{formatAp(calculation.questSweepAp)} AP</span>
            </div>
            <div className="flex min-h-7 items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">추가 소탕</span>
              <span className="tabular-nums text-foreground">{formatAp(calculation.extraSweepAp)} AP</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default PlannerShopSummary;
