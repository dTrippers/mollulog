import { useMemo } from "react";
import {
  convertClueSearchCostsToPoints,
  filterClueSearchShopResources,
  resolveClueSearchExchange,
} from "~/components/features/events/shop/clue-search";
import { useBonusCalculation, useShopCalculations } from "~/components/features/events/shop/hooks";
import { calculateMinigamePaymentCosts } from "~/components/features/events/shop/utils";
import { Callout } from "~/components/primitives";
import { type EventShopState, eventShopStatesEqual } from "~/domain/event-shop-state";
import type { PlannerShopContent } from "./PlannerShopOwnedQuantityEditor";

export type PlannerShopSummaryProps = {
  content: PlannerShopContent | null;
  state: EventShopState;
  defaultState: EventShopState;
};

function formatAp(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function PlannerShopSummary({ content, state, defaultState }: PlannerShopSummaryProps) {
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

  const hasPlanInput = !eventShopStatesEqual(state, defaultState);
  const plannedStages = stages
    .filter(({ difficulty }) => difficulty === 1)
    .map((stage) => ({
      uid: stage.uid,
      index: stage.index.trim() || "스테이지 정보를 확인할 수 없어요",
      enabled: Boolean(state.enabledStages[stage.uid]),
      calculatedRuns: calculation.stageRuns[stage.uid] ?? 0,
      extraRuns: state.extraStageRuns[stage.uid] ?? 0,
    }))
    .filter(({ enabled, calculatedRuns, extraRuns }) => enabled || calculatedRuns > 0 || extraRuns > 0);

  return (
    <section
      className="space-y-3 rounded-lg border border-border bg-card p-4"
      aria-labelledby="planner-shop-summary-title"
    >
      <div>
        <h3 id="planner-shop-summary-title" className="text-sm font-semibold text-foreground">
          상점 소탕 계산
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">이벤트 상점 상세 화면과 같은 계산 결과예요.</p>
      </div>

      {!content ? (
        <p className="text-sm text-muted-foreground">이벤트 상점 계산 정보를 확인할 수 없어요.</p>
      ) : !hasPlanInput ? (
        <p className="text-sm text-muted-foreground">
          아직 입력된 상점 계획이 없어요. 목표를 입력하면 필요한 소탕과 AP가 표시돼요.
        </p>
      ) : !calculation.isReady ? (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {calculation.isCalculating ? "소탕 횟수와 필요 AP를 계산하고 있어요…" : "소탕 계산 결과를 준비하고 있어요…"}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
            <span className="text-sm font-medium text-foreground">필요 AP</span>
            <span className="text-lg font-semibold tabular-nums text-foreground">
              {formatAp(calculation.totalApWithExtras)} AP
            </span>
          </div>

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-md bg-muted/30 p-2">
              <dt className="text-xs text-muted-foreground">스토리 / 초회</dt>
              <dd className="mt-1 font-medium tabular-nums">{formatAp(calculation.firstClearAp)} AP</dd>
            </div>
            <div className="rounded-md bg-muted/30 p-2">
              <dt className="text-xs text-muted-foreground">계산 소탕</dt>
              <dd className="mt-1 font-medium tabular-nums">{formatAp(calculation.questSweepAp)} AP</dd>
            </div>
            <div className="rounded-md bg-muted/30 p-2">
              <dt className="text-xs text-muted-foreground">추가 소탕</dt>
              <dd className="mt-1 font-medium tabular-nums">{formatAp(calculation.extraSweepAp)} AP</dd>
            </div>
          </dl>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground">퀘스트 소탕</h4>
            {plannedStages.length === 0 ? (
              <p className="text-sm text-muted-foreground">계산하거나 추가한 퀘스트 소탕이 없어요.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {plannedStages.map(({ uid, index, enabled, calculatedRuns, extraRuns }) => (
                  <li
                    key={uid}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-muted/30 px-2.5 py-2"
                  >
                    <span className="font-medium text-foreground">{index}</span>
                    <span className="text-right text-muted-foreground">
                      {enabled
                        ? `계산 ${formatAp(calculatedRuns)}회 · 추가 ${formatAp(extraRuns)}회`
                        : `미선택 · 저장된 추가 ${formatAp(extraRuns)}회는 계산에 포함되지 않아요`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {Object.keys(calculation.unobtainableTargets).length > 0 && (
            <Callout
              tone="warning"
              description="선택한 퀘스트에서 획득할 수 없는 재화가 있어 목표를 모두 충족하지 못할 수 있어요."
            />
          )}
        </>
      )}
    </section>
  );
}

export default PlannerShopSummary;
