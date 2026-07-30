import { ArrowPathIcon, ExclamationCircleIcon, UserIcon } from "@heroicons/react/16/solid";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSignIn } from "~/contexts/SignInProvider";
import type { CollectableResource, EventRewardBonus, MinigameConfig, ShopResource, Stage } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { EventShopState } from "~/models/event-shop-state";
import EventInfoCard from "./EventInfoCard";
import {
  CollectedTotalsSection,
  MiniGameSection,
  ShopResourceSelector,
  StageSelector,
  StudentBonusSelector,
} from "./shop";
import { useAutoSave, useBonusCalculation, useShopCalculations, useShopState } from "./shop/hooks";
import { calculateMinigamePaymentCosts } from "./shop/utils";

type EventDetailShopPageProps = {
  stages: Stage[];
  shopResources: ShopResource[];
  eventRewardBonus: EventRewardBonus[];
  recruitedStudentUids: string[];
  eventUid: string;
  shopStateUid: string;
  savedShopState: EventShopState | null;
  availablePurchaseDays: number;
  signedIn: boolean;
  minigameConfig?: MinigameConfig | null;
};

export default function EventDetailShopPage({
  stages,
  shopResources,
  eventRewardBonus,
  recruitedStudentUids,
  eventUid,
  shopStateUid,
  savedShopState,
  availablePurchaseDays,
  signedIn,
  minigameConfig = null,
}: EventDetailShopPageProps) {
  const collectableResources = useMemo<CollectableResource[]>(() => {
    const items: CollectableResource[] = [];
    for (const { paymentResource, purchaseTiers } of shopResources) {
      const paymentResources = [paymentResource, ...purchaseTiers.map((tier) => tier.paymentResource)];
      for (const paymentResource of paymentResources) {
        if (items.some(({ uid }) => uid === paymentResource.uid)) {
          continue;
        }

        items.push({
          type: paymentResource.type,
          uid: paymentResource.uid,
          name: paymentResource.name,
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

    if (minigameConfig) {
      const minigamePaymentResources = [
        minigameConfig.payment,
        ...minigameConfig.payments,
        ...minigameConfig.rewardGroups.flatMap((group) => group.payments),
      ];
      for (const { resourceType, resourceUid, resourceName } of minigamePaymentResources) {
        if (!items.some(({ uid }) => uid === resourceUid)) {
          items.push({ type: resourceType, uid: resourceUid, name: resourceName ?? resourceUid, forPayment: false });
        }
      }
    }

    return items;
  }, [stages, shopResources, minigameConfig]);

  const { showSignIn } = useSignIn();

  // Unified state management
  const { state, actions } = useShopState({ savedShopState, recruitedStudentUids, shopResources, stages });

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
  const { isSaving } = useAutoSave({ state, signedIn, shopStateUid, savedShopState, isInitialLoad });

  const minigamePaymentCosts = useMemo(() => {
    if (!minigameConfig) return undefined;
    return calculateMinigamePaymentCosts(minigameConfig, state.minigamePlayCount, state.minigamePaymentQuantityMode);
  }, [minigameConfig, state.minigamePaymentQuantityMode, state.minigamePlayCount]);

  // Shop calculations
  const stageCalculations = useShopCalculations({
    state,
    stages,
    shopResources,
    appliedBonusRatio: appliedBonusRatios,
    minigamePaymentCosts,
    minigameConfig,
  });

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
      {stageCalculations.isCalculating && (
        <div className="fixed right-4 bottom-[var(--mobile-bottom-offset)] z-layer-toast flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-lg md:right-8 lg:bottom-4">
          <ArrowPathIcon className="size-4 animate-spin" />
          <span className="text-sm font-medium">계산중...</span>
        </div>
      )}

      <div className="overflow-x-hidden">
        <div className="my-8">
          <EventInfoCard
            Icon={ExclamationCircleIcon}
            title="데이터가 부정확할 수 있어요"
            description="오류가 있거나 일본 서비스와 차이가 있을 수 있으니 참고용으로만 사용해주세요"
          />
          {!signedIn && (
            <EventInfoCard
              Icon={UserIcon}
              title="로그인 후 더 많은 기능을 이용할 수 있어요"
              description="모집 학생 데이터가 자동으로 반영되며, 입력한 정보를 저장하고 언제든지 불러올 수 있어요"
              onClick={showSignIn}
              showArrow
            />
          )}
        </div>

        <div className="space-y-6">
          <StudentBonusSelector
            eventRewardBonus={eventRewardBonus}
            recruitedStudentUids={recruitedStudentUids}
            state={state}
            actions={actions}
            signedIn={signedIn}
          />

          {collectableResources && (
            <ShopResourceSelector
              shopResources={shopResources}
              collectableResources={collectableResources}
              eventUid={shopStateUid}
              state={state}
              actions={actions}
              availablePurchaseDays={availablePurchaseDays}
            />
          )}

          {minigameConfig && <MiniGameSection config={minigameConfig} state={state} actions={actions} />}
          <StageSelector
            stages={stages}
            appliedBonusRatio={appliedBonusRatios}
            stageRuns={stageCalculations.stageRuns}
            state={state}
            actions={actions}
          />

          <CollectedTotalsSection
            stages={stages}
            collectableResources={collectableResources}
            shopResources={shopResources}
            eventUid={eventUid}
            minigameConfig={minigameConfig}
            state={state}
            actions={actions}
            stageCalculations={stageCalculations}
            signedIn={signedIn}
          />
        </div>
      </div>
    </>
  );
}
