import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/primitives";
import type { CollectableResource, EventRewardBonus, MinigameConfig, ShopResource, Stage } from "~/domain/event-shop";
import type { SavedShopStateSource } from "~/domain/event-shop-state-key";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { EventShopState } from "~/models/event-shop-state";
import { calculateCardFlipStrategyComparison } from "~/domain/card-flip-strategy";
import type { EventShopPlanContext } from "./shop";
import {
  convertClueSearchCostsToPoints,
  filterClueSearchShopResources,
  resolveClueSearchExchange,
} from "./shop/clue-search";
import {
  type GuestPlannerStatus,
  useAutoSave,
  useBonusCalculation,
  useShopCalculations,
  useShopState,
} from "./shop/hooks";
import { useTreasureHuntStats } from "./shop/hooks/useTreasureHuntStats";
import type { TreasureHuntSectionStatus } from "./shop/TreasureHuntSection";
import {
  calculateTreasureHuntEstimate,
  getTreasureHuntCellCostResources,
  getTreasureHuntRoundSelection,
  shouldHoldTreasureHuntShopCalculations,
  type TreasureHuntEstimate,
} from "./shop/treasure-hunt";
import { calculateMinigamePaymentCosts } from "./shop/utils";

type EventDetailShopPageProps = {
  stages: Stage[];
  shopResources: ShopResource[];
  ownedQuantities: Record<string, number> | null;
  eventRewardBonus: EventRewardBonus[];
  recruitedStudentUids: string[];
  eventUid: string;
  shopStateUid: string;
  savedShopState: EventShopState | null;
  savedShopStateSource: SavedShopStateSource;
  availablePurchaseDays: number;
  signedIn: boolean;
  guestPlannerStatus?: GuestPlannerStatus;
  minigameConfig?: MinigameConfig | null;
  renderScreen: (plan: EventShopPlanContext) => ReactNode;
};

export default function EventDetailShopPage({
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
  guestPlannerStatus = "none",
  minigameConfig = null,
  renderScreen,
}: EventDetailShopPageProps) {
  const clueSearchExchange = useMemo(
    () => resolveClueSearchExchange(minigameConfig, shopResources),
    [minigameConfig, shopResources],
  );
  const visibleShopResources = useMemo(
    () => filterClueSearchShopResources(shopResources, clueSearchExchange),
    [clueSearchExchange, shopResources],
  );
  const isTreasureHunt = minigameConfig?.minigameType === "treasure_hunt";
  const treasureHunt = isTreasureHunt ? (minigameConfig.treasureHunt ?? null) : null;

  const collectableResources = useMemo<CollectableResource[]>(() => {
    const items: CollectableResource[] = [];
    for (const { paymentResource, purchaseTiers } of visibleShopResources) {
      const paymentResources = [paymentResource, ...purchaseTiers.map((tier) => tier.paymentResource)];
      for (const paymentResource of paymentResources) {
        if (items.some(({ uid }) => uid === paymentResource.uid)) {
          continue;
        }

        items.push({
          type: paymentResource.type,
          uid: paymentResource.uid,
          name: paymentResource.name,
          imageUrl: paymentResource.imageUrl,
          forPayment: true,
        });
      }
    }

    for (const stage of stages) {
      for (const { item } of stage.rewards) {
        if (item && item.category === "coin" && !items.some(({ uid }) => uid === item.uid)) {
          items.push({ type: ResourceTypeEnum.Item, uid: item.uid, name: item.name, forPayment: false });
        }
      }
    }

    if (minigameConfig?.minigameType === "treasure_hunt") {
      const cellCosts = getTreasureHuntCellCostResources(minigameConfig.treasureHunt?.rounds ?? []);
      for (const payment of cellCosts) {
        if (!items.some(({ uid }) => uid === payment.resourceUid)) {
          items.push({
            type: payment.resourceType,
            uid: payment.resourceUid,
            name: payment.resourceName ?? "재화",
            imageUrl: payment.imageUrl,
            forPayment: false,
          });
        }
      }
    } else if (minigameConfig) {
      const minigamePaymentResources = [
        minigameConfig.payment,
        ...minigameConfig.payments,
        ...minigameConfig.rewardGroups.flatMap((group) => group.payments),
      ];
      for (const { resourceType, resourceUid, resourceName, imageUrl } of minigamePaymentResources) {
        if (clueSearchExchange?.supported && clueSearchExchange.clueUids.includes(resourceUid)) {
          continue;
        }

        if (!items.some(({ uid }) => uid === resourceUid)) {
          items.push({
            type: resourceType,
            uid: resourceUid,
            name: resourceName ?? "재화",
            imageUrl,
            forPayment: false,
          });
        }
      }

      if (clueSearchExchange?.supported && clueSearchExchange.pointResource) {
        const { type, uid, name, imageUrl } = clueSearchExchange.pointResource;
        if (!items.some((item) => item.uid === uid)) {
          items.push({ type, uid, name, imageUrl, forPayment: false });
        }
      }
    }

    return items;
  }, [clueSearchExchange, minigameConfig, stages, visibleShopResources]);

  // Unified state management
  const { state, actions } = useShopState({
    savedShopState,
    recruitedStudentUids,
    shopResources: visibleShopResources,
    stages,
    signedIn,
  });
  const cardFlipComparison = useMemo(() => {
    if (minigameConfig?.minigameType !== "card_flip" || minigameConfig.cardFlip?.status !== "available") {
      return null;
    }
    return calculateCardFlipStrategyComparison(minigameConfig.cardFlip, state.minigamePlayCount);
  }, [minigameConfig, state.minigamePlayCount]);
  const selectedCardFlipResult = cardFlipComparison?.find(({ strategy }) => strategy === state.cardFlipStrategy) ?? null;

  const treasureHuntRoundSelection = useMemo(
    () =>
      getTreasureHuntRoundSelection(
        isTreasureHunt ? treasureHunt : null,
        state.minigameStartRound,
        state.minigamePlayCount,
      ),
    [isTreasureHunt, state.minigamePlayCount, state.minigameStartRound, treasureHunt],
  );
  const treasureHuntTargetRoundOverLimit = isTreasureHunt && treasureHuntRoundSelection.targetRoundOverLimit;
  const selectedTreasureHuntRows = treasureHuntRoundSelection.rows;
  const treasureHuntEconomicsCompatible = treasureHuntRoundSelection.economicsCompatible;
  const treasureHuntWorkerItems = treasureHuntRoundSelection.workerItems;
  const treasureHuntStats = useTreasureHuntStats(treasureHuntWorkerItems, treasureHuntWorkerItems.length > 0);
  const treasureHuntCalculation = useMemo(() => {
    let status: TreasureHuntSectionStatus = "empty";
    let estimate: TreasureHuntEstimate | null = null;
    let progress: number | null = null;
    const statsBySignature = treasureHuntStats.statsBySignature;

    if (treasureHuntTargetRoundOverLimit) {
      status = "round-limit";
    } else if (isTreasureHunt && !treasureHunt) {
      status = "no-data";
    } else if (isTreasureHunt && selectedTreasureHuntRows.length > 0 && !treasureHuntEconomicsCompatible) {
      status = "incompatible";
    } else if (isTreasureHunt && selectedTreasureHuntRows.length > 0) {
      const signatures = treasureHuntWorkerItems.map(({ signature }) => signature);
      const hasFailure = signatures.some((signature) => statsBySignature[signature]?.failed);
      const hasHistogram = signatures.every((signature) => !!statsBySignature[signature]?.histogram);
      const isComplete = signatures.every((signature) => {
        const stats = statsBySignature[signature];
        return !!stats?.histogram && !stats.failed && stats.completedGames >= stats.targetGames;
      });
      if (hasFailure) {
        status = "failed";
      } else if (!hasHistogram) {
        status = "pending";
      } else if (isComplete) {
        status = "ready";
      } else {
        status = "provisional";
      }

      progress = treasureHuntStats.progress;
      if (hasHistogram && !hasFailure) {
        estimate = calculateTreasureHuntEstimate(
          selectedTreasureHuntRows,
          statsBySignature,
          state.minigamePaymentQuantityMode,
        );
      }
    }

    return {
      status,
      progress,
      rows: selectedTreasureHuntRows,
      statsBySignature,
      estimate,
      retry: treasureHuntStats.retry,
    };
  }, [
    isTreasureHunt,
    treasureHuntTargetRoundOverLimit,
    selectedTreasureHuntRows,
    state.minigamePaymentQuantityMode,
    treasureHunt,
    treasureHuntEconomicsCompatible,
    treasureHuntStats.retry,
    treasureHuntStats.progress,
    treasureHuntStats.statsBySignature,
    treasureHuntWorkerItems,
  ]);

  // Track initial load for auto-save
  const [isInitialLoad, setIsInitialLoad] = useState(() => !savedShopState);
  const hasSavedShopStateRef = useRef(savedShopState !== null);
  useEffect(() => {
    if (!hasSavedShopStateRef.current) {
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, []);

  // Bonus calculation
  const { appliedBonusRatios } = useBonusCalculation({
    eventRewardBonus,
    selectedStudentUids: state.selectedBonusStudentUids,
    selectedStudentUidsByItem:
      state.bonusStudentSelectionMode === "perItem" ? state.selectedBonusStudentUidsByItem : undefined,
  });

  // Auto-save
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
    if (minigameConfig.minigameType === "treasure_hunt") {
      return treasureHuntCalculation.estimate ? [treasureHuntCalculation.estimate.payment] : [];
    }
    if (minigameConfig.minigameType === "card_flip") {
      return selectedCardFlipResult?.costs ?? [];
    }
    const clueCosts = calculateMinigamePaymentCosts(
      minigameConfig,
      state.minigamePlayCount,
      state.minigamePaymentQuantityMode,
      state.minigameStartRound,
    );
    return minigameConfig.minigameType === "clue_search"
      ? convertClueSearchCostsToPoints(clueCosts, clueSearchExchange)
      : clueCosts;
  }, [
    clueSearchExchange,
    minigameConfig,
    treasureHuntCalculation.estimate,
    selectedCardFlipResult,
    state.minigamePaymentQuantityMode,
    state.minigamePlayCount,
    state.minigameStartRound,
  ]);

  const minigameRewards = useMemo(() => {
    if (minigameConfig?.minigameType === "card_flip") return selectedCardFlipResult?.rewards ?? [];
    if (!isTreasureHunt) return undefined;
    const estimate = treasureHuntCalculation.estimate;
    return estimate ? [...estimate.treasureRewards, ...estimate.openCellRewards] : [];
  }, [isTreasureHunt, minigameConfig, selectedCardFlipResult, treasureHuntCalculation.estimate]);
  const holdTreasureHuntCalculations =
    isTreasureHunt && shouldHoldTreasureHuntShopCalculations(treasureHuntCalculation.status);
  const minigameConfigForCalculations = isTreasureHunt ? null : minigameConfig;

  // Shop calculations
  const stageCalculations = useShopCalculations({
    state,
    stages,
    shopResources: visibleShopResources,
    appliedBonusRatio: appliedBonusRatios,
    minigamePaymentCosts,
    minigameRewards,
    excludedShopResourceUids: clueSearchExchange?.hiddenShopResourceUids,
    minigameConfig: minigameConfigForCalculations,
    holdCalculations: holdTreasureHuntCalculations,
  });
  const showCalculationToast = isTreasureHunt ? stageCalculations.isUserCalculating : stageCalculations.isCalculating;
  const resultTreasureHuntStatus =
    isTreasureHunt &&
    (treasureHuntCalculation.status === "pending" ||
      treasureHuntCalculation.status === "provisional" ||
      treasureHuntCalculation.status === "failed" ||
      treasureHuntCalculation.status === "round-limit")
      ? treasureHuntCalculation.status
      : undefined;
  const plan: EventShopPlanContext = {
    stages,
    shopResources: visibleShopResources,
    ownedQuantities,
    eventRewardBonus,
    appliedBonusRatio: appliedBonusRatios,
    recruitedStudentUids,
    eventUid,
    shopStateUid,
    savedShopStateSource,
    availablePurchaseDays,
    signedIn,
    state,
    actions,
    minigameConfig,
    minigameConfigForCalculations,
    collectableResources,
    clueSearchExchange,
    treasureHuntCalculation,
    holdTreasureHuntCalculations,
    resultTreasureHuntStatus,
    provisionalMinigameResourceUid: treasureHuntCalculation.rows[0]?.config.cellCost.resourceUid,
    minigamePaymentCosts,
    minigameRewards,
    cardFlipComparison,
    stageCalculations,
    isCalculating: stageCalculations.isCalculating,
  };

  return (
    <>
      {/* Saving indicator */}
      {isSaving && (
        <div className="fixed right-4 bottom-[var(--mobile-bottom-offset)] z-layer-toast flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900 md:right-8 lg:bottom-4">
          <ArrowPathIcon className="size-4 animate-spin" />
          <span className="text-sm font-medium">저장중...</span>
        </div>
      )}

      {/* Calculating indicator */}
      {showCalculationToast && (
        <div className="fixed right-4 bottom-[var(--mobile-bottom-offset)] z-layer-toast flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-lg md:right-8 lg:bottom-4">
          <ArrowPathIcon className="size-4 animate-spin" />
          <span className="text-sm font-medium">계산중...</span>
        </div>
      )}

      <div className="overflow-x-hidden">
        {saveError && (
          <div
            aria-live="polite"
            className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300"
            role="alert"
          >
            <span>{saveError}</span>
            <Button text="다시 시도" size="sm" variant="secondary" onClick={retrySave} disabled={isSaving} />
          </div>
        )}
        {renderScreen(plan)}
      </div>
    </>
  );
}
