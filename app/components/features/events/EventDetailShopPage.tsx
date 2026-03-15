import { useEffect, useMemo, useRef, useState } from "react";
import { ExclamationCircleIcon, UserIcon, ArrowPathIcon } from "@heroicons/react/16/solid";
import EventInfoCard from "./EventInfoCard";
import { useSignIn } from "~/contexts/SignInProvider";
import type { EventShopState } from "~/models/event-shop-state";
import {
  CollectedTotalsSection,
  MiniGameSection,
  ShopResourceSelector,
  StageSelector,
  StudentBonusSelector,
} from "./shop";
import type { CollectableResource, EventRewardBonus, ShopResource, Stage } from "./shop";
import type { MinigameConfig } from "./shop/constants";
import { useAutoSave, useBonusCalculation, useShopCalculations, useShopState } from "./shop/hooks";

type EventDetailShopPageProps = {
  stages: Stage[];
  shopResources: ShopResource[];
  eventRewardBonus: EventRewardBonus[];
  recruitedStudentUids: string[];
  eventUid: string;
  savedShopState: EventShopState | null;
  signedIn: boolean;
  minigameConfig?: MinigameConfig | null;
};

export default function EventDetailShopPage({ stages, shopResources, eventRewardBonus, recruitedStudentUids, eventUid, savedShopState, signedIn, minigameConfig = null }: EventDetailShopPageProps) {
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

    if (minigameConfig) {
      const { resourceUid, resourceName } = minigameConfig.payment;
      if (!items.some(({ uid }) => uid === resourceUid)) {
        items.push({ uid: resourceUid, name: resourceName ?? resourceUid, forPayment: false });
      }
    }

    return items.sort((a, b) => a.uid.localeCompare(b.uid));
  }, [stages, shopResources, minigameConfig]);

  const { showSignIn } = useSignIn();

  // Unified state management
  const { state, actions } = useShopState({ savedShopState, recruitedStudentUids, stages });

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
  });

  // Auto-save
  const { isSaving } = useAutoSave({ state, signedIn, eventUid, savedShopState, isInitialLoad });

  // Memoize minigame payment resource to prevent unnecessary recalculations
  const minigamePaymentResource = useMemo(() => {
    if (!minigameConfig) return undefined;
    return {
      resourceUid: minigameConfig.payment.resourceUid,
      quantity: minigameConfig.payment.quantity,
    };
  }, [minigameConfig]);

  // Shop calculations
  const stageCalculations = useShopCalculations({
    state,
    stages,
    shopResources,
    collectableResources,
    appliedBonusRatio: appliedBonusRatios,
    minigamePaymentResource,
    minigameRewards: undefined,
    minigameConfig,
    eventUid,
  });

  return (
    <>
      {/* Saving indicator */}
      {isSaving && (
        <div className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900 md:right-8">
          <ArrowPathIcon className="size-4 animate-spin" />
          <span className="text-sm font-medium">저장중...</span>
        </div>
      )}

      {/* Calculating indicator */}
      {stageCalculations.isCalculating && (
        <div className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-lg md:right-8">
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
