import { useMemo, useState, useEffect } from "react";
import { ExclamationCircleIcon, UserIcon, ArrowPathIcon } from "@heroicons/react/16/solid";
import EventInfoCard from "./EventInfoCard";
import { useSignIn } from "~/contexts/SignInProvider";
import type { EventShopState } from "~/models/event-shop-state";
import { StudentBonusSelector, ShopResourceSelector, StageSelector, MiniGameSection, CollectedTotalsSection } from "./shop";
import type { Stage, ShopResource, EventRewardBonus, CollectableResource } from "./shop";
import { MINIGAME_CONFIG } from "./shop/constants";
import { useShopState, useBonusCalculation, useAutoSave, useShopCalculations } from "./shop/hooks";

type EventDetailShopPageProps = {
  stages: Stage[];
  shopResources: ShopResource[];
  eventRewardBonus: EventRewardBonus[];
  recruitedStudentUids: string[];
  eventUid: string;
  savedShopState: EventShopState | null;
  signedIn: boolean;
};

export default function EventDetailShopPage({ stages, shopResources, eventRewardBonus, recruitedStudentUids, eventUid, savedShopState, signedIn }: EventDetailShopPageProps) {
  const minigameConfig = MINIGAME_CONFIG[eventUid];

  const collectableResources = useMemo<CollectableResource[]>(() => {
    const items: CollectableResource[] = [];
    for (const { paymentResource } of shopResources) {
      if (!items.some(({ uid }) => uid === paymentResource.uid)) {
        items.push({ uid: paymentResource.uid, name: paymentResource.name, forPayment: true });
      }
    }

    for (const stage of stages) {
      for (const { item } of stage.rewards) {
        if (item && item.category === "coin" && !items.some(({ uid }) => uid === item.uid)) {
          items.push({ uid: item.uid, name: item.name, forPayment: false });
        }
      }
    }

    return items.sort((a, b) => a.uid.localeCompare(b.uid));
  }, [stages, shopResources]);

  const { showSignIn } = useSignIn();

  // Unified state management
  const { state, actions } = useShopState({ savedShopState, recruitedStudentUids, stages });

  // Track initial load for auto-save
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  useEffect(() => {
    if (savedShopState) {
      setIsInitialLoad(false);
    } else {
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []); // Only run on mount

  // Bonus calculation
  const { appliedBonusRatios } = useBonusCalculation({
    eventRewardBonus,
    selectedStudentUids: state.selectedBonusStudentUids,
  });

  // Auto-save
  const { isSaving } = useAutoSave({ state, signedIn, eventUid, savedShopState, isInitialLoad });

  // Shop calculations
  const stageCalculations = useShopCalculations({
    state,
    stages,
    shopResources,
    collectableResources,
    appliedBonusRatio: appliedBonusRatios,
    minigamePaymentResource: minigameConfig ? {
      resourceUid: minigameConfig.payment.resourceUid,
      quantity: minigameConfig.payment.quantity,
    } : undefined,
    minigameRewards: undefined,
    eventUid,
  });

  return (
    <>
      {/* Saving indicator */}
      {isSaving && (
        <div className="fixed bottom-4 right-8 z-50 flex items-center gap-2 px-4 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg shadow-lg">
          <ArrowPathIcon className="size-4 animate-spin" />
          <span className="text-sm font-medium">저장중...</span>
        </div>
      )}

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

      <div>
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
            state={state}
            actions={actions}
          />
        )}

        {minigameConfig && (
          <MiniGameSection
            title={minigameConfig.title}
            config={minigameConfig}
            state={state}
            actions={actions}
          />
        )}

        <StageSelector
          stages={stages}
          appliedBonusRatio={appliedBonusRatios}
          stageRuns={stageCalculations.stageRuns}
          state={state}
          actions={actions}
        />

        <CollectedTotalsSection
          breakdown={stageCalculations.itemBreakdown}
          collectableResources={collectableResources}
          shopResources={shopResources}
          totalApWithExtras={stageCalculations.totalApWithExtras}
          firstClearAp={stageCalculations.firstClearAp}
          questSweepAp={stageCalculations.questSweepAp}
          extraSweepAp={stageCalculations.extraSweepAp}
          minigameRewards={undefined}
          eventUid={eventUid}
          state={state}
          actions={actions}
        />
      </div>
    </>
  );
}
