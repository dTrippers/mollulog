import { useEffect, useMemo, useRef, useState } from "react";
import { calculateCardFlipStrategyComparison } from "~/domain/card-flip-strategy";
import type { MinigameConfig, RoadPuzzleMap } from "~/domain/event-shop";
import { buildCollectableResources } from "~/domain/event-shop/calculations/collectable-resources";
import {
  convertClueSearchCostsToPoints,
  filterClueSearchShopResources,
  resolveClueSearchExchange,
} from "~/domain/event-shop/clue-search";
import {
  calculateTreasureHuntEstimate,
  getTreasureHuntRoundSelection,
  shouldHoldTreasureHuntShopCalculations,
  type TreasureHuntEstimate,
} from "~/domain/event-shop/treasure-hunt";
import { calculateMinigamePaymentCosts } from "~/domain/event-shop/utils";
import type { SavedShopStateSource } from "~/domain/event-shop-state-key";
import { getRoadPuzzleTotalCost, getRoadPuzzleTotalRewards } from "~/domain/road-puzzle/calculator";
import type { GuestPlannerStatus } from "~/lib/event-shop/hooks";
import { useAutoSave, useBonusCalculation, useShopCalculations, useShopState } from "~/lib/event-shop/hooks";
import { useRoadPuzzleStats } from "~/lib/event-shop/hooks/useRoadPuzzleStats";
import { useTreasureHuntStats } from "~/lib/event-shop/hooks/useTreasureHuntStats";
import type { EventShopPlanContext, TreasureHuntSectionState } from "~/lib/event-shop/plan-context";
import type { EventShopState } from "~/models/event-shop-state";

const EMPTY_ROAD_PUZZLE_MAPS: RoadPuzzleMap[] = [];

export type EventShopControllerInput = {
  stages: EventShopPlanContext["stages"];
  shopResources: EventShopPlanContext["shopResources"];
  ownedQuantities: EventShopPlanContext["ownedQuantities"];
  eventRewardBonus: EventShopPlanContext["eventRewardBonus"];
  recruitedStudentUids: string[];
  eventUid: string;
  shopStateUid: string;
  savedShopState: EventShopState | null;
  savedShopStateSource: SavedShopStateSource;
  availablePurchaseDays: number;
  signedIn: boolean;
  guestPlannerStatus: GuestPlannerStatus;
  minigameConfig: MinigameConfig | null;
  jankenStudentGrowthUid?: string | null;
  jankenClearedStageUids: string[];
  setJankenClearedStageUids: (stageUids: string[]) => void;
};

export function useEventShopPlan(input: EventShopControllerInput) {
  const {
    stages,
    shopResources,
    ownedQuantities,
    eventRewardBonus,
    recruitedStudentUids,
    eventUid,
    shopStateUid,
    savedShopState,
    savedShopStateSource,
    availablePurchaseDays,
    signedIn,
    guestPlannerStatus,
    minigameConfig,
    jankenStudentGrowthUid,
    jankenClearedStageUids,
    setJankenClearedStageUids,
  } = input;
  const clueSearchExchange = useMemo(
    () => resolveClueSearchExchange(minigameConfig, shopResources),
    [minigameConfig, shopResources],
  );
  const visibleShopResources = useMemo(
    () => filterClueSearchShopResources(shopResources, clueSearchExchange),
    [clueSearchExchange, shopResources],
  );
  const isTreasureHunt = minigameConfig?.minigameType === "treasure_hunt";
  const isRoadPuzzle = minigameConfig?.minigameType === "road_puzzle";
  const treasureHunt = isTreasureHunt ? (minigameConfig.treasureHunt ?? null) : null;
  const roadPuzzle = isRoadPuzzle ? (minigameConfig.roadPuzzle ?? null) : null;
  const roadPuzzlePaymentQuantity = isRoadPuzzle ? minigameConfig.payment.quantity : 0;

  const collectableResources = useMemo(
    () =>
      buildCollectableResources({ shopResources: visibleShopResources, stages, minigameConfig, clueSearchExchange }),
    [clueSearchExchange, minigameConfig, stages, visibleShopResources],
  );

  const { state, actions } = useShopState({
    savedShopState,
    recruitedStudentUids,
    shopResources: visibleShopResources,
    stages,
    signedIn,
  });
  const cardFlipComparison = useMemo(() => {
    if (minigameConfig?.minigameType !== "card_flip" || minigameConfig.cardFlip?.status !== "available") return null;
    return calculateCardFlipStrategyComparison(minigameConfig.cardFlip, state.minigamePlayCount);
  }, [minigameConfig, state.minigamePlayCount]);
  const selectedCardFlipResult =
    cardFlipComparison?.find(({ strategy }) => strategy === state.cardFlipStrategy) ?? null;
  const roadPuzzleCalculation = useRoadPuzzleStats(roadPuzzle?.maps ?? EMPTY_ROAD_PUZZLE_MAPS, Boolean(roadPuzzle));
  const roadPuzzleTotalCost = useMemo(() => {
    if (!roadPuzzle || state.minigamePlayCount <= 0 || roadPuzzleCalculation.status !== "ready") return null;
    return getRoadPuzzleTotalCost(
      roadPuzzle,
      roadPuzzleCalculation.resultsByUid,
      Math.max(1, state.minigameStartRound),
      state.minigamePlayCount,
      state.minigamePaymentQuantityMode,
      roadPuzzlePaymentQuantity,
    );
  }, [
    roadPuzzle,
    roadPuzzleCalculation.resultsByUid,
    roadPuzzleCalculation.status,
    roadPuzzlePaymentQuantity,
    state.minigamePaymentQuantityMode,
    state.minigamePlayCount,
    state.minigameStartRound,
  ]);
  const treasureHuntRoundSelection = useMemo(
    () =>
      getTreasureHuntRoundSelection(
        isTreasureHunt ? treasureHunt : null,
        state.minigameStartRound,
        state.minigamePlayCount,
      ),
    [isTreasureHunt, state.minigamePlayCount, state.minigameStartRound, treasureHunt],
  );
  const treasureHuntStats = useTreasureHuntStats(
    treasureHuntRoundSelection.workerItems,
    treasureHuntRoundSelection.workerItems.length > 0,
  );
  const treasureHuntCalculation = useMemo<TreasureHuntSectionState>(() => {
    let status: TreasureHuntSectionState["status"] = "empty";
    let estimate: TreasureHuntEstimate | null = null;
    if (treasureHuntRoundSelection.targetRoundOverLimit) status = "round-limit";
    else if (isTreasureHunt && !treasureHunt) status = "no-data";
    else if (
      isTreasureHunt &&
      treasureHuntRoundSelection.rows.length > 0 &&
      !treasureHuntRoundSelection.economicsCompatible
    )
      status = "incompatible";
    else if (isTreasureHunt && treasureHuntRoundSelection.rows.length > 0) {
      const signatures = treasureHuntRoundSelection.workerItems.map(({ signature }) => signature);
      const hasFailure = signatures.some((signature) => treasureHuntStats.statsBySignature[signature]?.failed);
      const hasHistogram = signatures.every((signature) => !!treasureHuntStats.statsBySignature[signature]?.histogram);
      const complete = signatures.every((signature) => {
        const stats = treasureHuntStats.statsBySignature[signature];
        return !!stats?.histogram && !stats.failed && stats.completedGames >= stats.targetGames;
      });
      status = hasFailure ? "failed" : !hasHistogram ? "pending" : complete ? "ready" : "provisional";
      if (hasHistogram && !hasFailure) {
        estimate = calculateTreasureHuntEstimate(
          treasureHuntRoundSelection.rows,
          treasureHuntStats.statsBySignature,
          state.minigamePaymentQuantityMode,
        );
      }
    }
    return {
      status,
      progress: treasureHuntStats.progress,
      rows: treasureHuntRoundSelection.rows,
      statsBySignature: treasureHuntStats.statsBySignature,
      estimate,
      retry: treasureHuntStats.retry,
    };
  }, [isTreasureHunt, state.minigamePaymentQuantityMode, treasureHunt, treasureHuntRoundSelection, treasureHuntStats]);

  const [isInitialLoad, setIsInitialLoad] = useState(() => !savedShopState);
  const hasSavedShopStateRef = useRef(savedShopState !== null);
  useEffect(() => {
    if (hasSavedShopStateRef.current) return;
    const timer = setTimeout(() => setIsInitialLoad(false), 100);
    return () => clearTimeout(timer);
  }, []);
  const { appliedBonusRatios, bonusSummary } = useBonusCalculation({
    eventRewardBonus,
    selectedStudentUids: state.selectedBonusStudentUids,
    selectedStudentUidsByItem:
      state.bonusStudentSelectionMode === "perItem" ? state.selectedBonusStudentUidsByItem : undefined,
  });
  const { isSaving, saveError, retrySave } = useAutoSave({
    state,
    signedIn,
    timelineUid: eventUid,
    shopStateUid,
    savedShopState,
    isInitialLoad,
    guestPlannerStatus,
  });

  const minigamePaymentCosts = useMemo(() => {
    if (!minigameConfig) return undefined;
    if (minigameConfig.minigameType === "road_puzzle") {
      if (state.minigamePlayCount <= 0 || roadPuzzleTotalCost === null) return [];
      return [{ ...minigameConfig.payment, quantity: roadPuzzleTotalCost }];
    }
    if (minigameConfig.minigameType === "treasure_hunt")
      return treasureHuntCalculation.estimate ? [treasureHuntCalculation.estimate.payment] : [];
    if (minigameConfig.minigameType === "card_flip") return selectedCardFlipResult?.costs ?? [];
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
    roadPuzzleTotalCost,
    selectedCardFlipResult,
    state.minigamePaymentQuantityMode,
    state.minigamePlayCount,
    state.minigameStartRound,
    treasureHuntCalculation.estimate,
  ]);
  const minigameRewards = useMemo(() => {
    if (minigameConfig?.minigameType === "card_flip") return selectedCardFlipResult?.rewards ?? [];
    if (minigameConfig?.minigameType === "road_puzzle") {
      return roadPuzzle
        ? getRoadPuzzleTotalRewards(roadPuzzle, Math.max(1, state.minigameStartRound), state.minigamePlayCount)
        : [];
    }
    if (!isTreasureHunt) return undefined;
    const estimate = treasureHuntCalculation.estimate;
    return estimate ? [...estimate.treasureRewards, ...estimate.openCellRewards] : [];
  }, [
    isTreasureHunt,
    minigameConfig,
    roadPuzzle,
    selectedCardFlipResult,
    state.minigamePlayCount,
    state.minigameStartRound,
    treasureHuntCalculation.estimate,
  ]);
  const holdTreasureHuntCalculations =
    isTreasureHunt && shouldHoldTreasureHuntShopCalculations(treasureHuntCalculation.status);
  const holdRoadPuzzleCalculationInput =
    isRoadPuzzle &&
    state.minigamePlayCount > 0 &&
    (roadPuzzleCalculation.status !== "ready" || roadPuzzleTotalCost === null);
  const minigameConfigForCalculations =
    isTreasureHunt || holdTreasureHuntCalculations || holdRoadPuzzleCalculationInput ? null : minigameConfig;
  const stageCalculations = useShopCalculations({
    state,
    stages,
    shopResources: visibleShopResources,
    appliedBonusRatio: appliedBonusRatios,
    minigamePaymentCosts,
    minigameRewards,
    excludedShopResourceUids: clueSearchExchange?.hiddenShopResourceUids,
    minigameConfig: minigameConfigForCalculations,
    jankenClearedStageUids,
    holdCalculations: holdTreasureHuntCalculations || holdRoadPuzzleCalculationInput,
  });
  const holdRoadPuzzleCalculations =
    isRoadPuzzle && state.minigamePlayCount > 0 && (holdRoadPuzzleCalculationInput || !stageCalculations.isReady);
  const roadPuzzlePlannerStatus: EventShopPlanContext["roadPuzzlePlannerStatus"] = holdRoadPuzzleCalculations
    ? !roadPuzzle
      ? "missing"
      : roadPuzzleCalculation.status === "failed" ||
          (roadPuzzleCalculation.status === "ready" && roadPuzzleTotalCost === null)
        ? "failed"
        : "pending"
    : undefined;
  const plan: EventShopPlanContext = {
    stages,
    shopResources: visibleShopResources,
    ownedQuantities,
    eventRewardBonus,
    appliedBonusRatio: appliedBonusRatios,
    bonusSummary,
    recruitedStudentUids,
    eventUid,
    shopStateUid,
    savedShopStateSource,
    availablePurchaseDays,
    signedIn,
    jankenClearedStageUids,
    setJankenClearedStageUids,
    state,
    actions,
    minigameConfig,
    jankenStudentGrowthUid,
    minigameConfigForCalculations,
    collectableResources,
    clueSearchExchange,
    treasureHuntCalculation,
    holdTreasureHuntCalculations,
    roadPuzzleCalculation,
    holdRoadPuzzleCalculations,
    roadPuzzlePlannerStatus,
    resultTreasureHuntStatus:
      isTreasureHunt && ["pending", "provisional", "failed", "round-limit"].includes(treasureHuntCalculation.status)
        ? (treasureHuntCalculation.status as EventShopPlanContext["resultTreasureHuntStatus"])
        : undefined,
    provisionalMinigameResourceUid: treasureHuntCalculation.rows[0]?.config.cellCost.resourceUid,
    minigamePaymentCosts,
    minigameRewards,
    cardFlipComparison,
    stageCalculations,
    isCalculating: stageCalculations.isCalculating,
    isSaving,
    saveError,
    retrySave,
  };
  return { plan, isSaving, saveError, retrySave };
}
