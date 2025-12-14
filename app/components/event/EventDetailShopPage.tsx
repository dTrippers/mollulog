import { useFetcher } from "react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import type Decimal from "decimal.js";
import { ExclamationCircleIcon, UserIcon, ArrowPathIcon } from "@heroicons/react/16/solid";
import EventInfoCard from "./EventInfoCard";
import { useSignIn } from "~/contexts/SignInProvider";
import type { EventShopState } from "~/models/event-shop-state";
import { StudentBonusSelector, ShopResourceSelector, StageSelector } from "./shop";
import type { Stage, ShopResource, EventRewardBonus, CollectableResource } from "./shop";

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
  const collectableResources = useMemo<CollectableResource[]>(() => {
    const items: CollectableResource[] = [];
    shopResources.forEach(({ paymentResource }) => {
      if (!items.some(({ uid }) => uid === paymentResource.uid)) {
        items.push({ uid: paymentResource.uid, name: paymentResource.name, forPayment: true });
      }
    });

    stages.forEach((stage) => {
      stage.rewards.forEach(({ item }) => {
        if (item && item.category === "coin" && !items.some(({ uid }) => uid === item.uid)) {
          items.push({ uid: item.uid, name: item.name, forPayment: false });
        }
      });
    });

    return items.sort((a, b) => a.uid.localeCompare(b.uid));
  }, [stages, shopResources]);

  const { showSignIn } = useSignIn();

  const fetcher = useFetcher();
  const saveIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const lastSavedStateRef = useRef<EventShopState | null>(null);

  // Initialize state from saved state or defaults
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>(
    savedShopState?.itemQuantities ?? {}
  );
  const [selectedBonusStudentUids, setSelectedBonusStudentUids] = useState<string[]>(
    savedShopState?.selectedBonusStudentUids ?? recruitedStudentUids
  );
  const [includeRecruitedStudents, setIncludeRecruitedStudents] = useState<boolean>(
    savedShopState?.includeRecruitedStudents ?? true
  );
  const [enabledStages, setEnabledStages] = useState<Record<string, boolean>>(
    savedShopState?.enabledStages ?? stages.reduce((acc, stage) => ({ ...acc, [stage.uid]: Number.parseInt(stage.index) >= 9 }), {})
  );
  const [existingPaymentItemQuantities, setExistingPaymentItemQuantities] = useState<Record<string, number>>(
    savedShopState?.existingPaymentItemQuantities ?? {}
  );
  const [includeFirstClear, setIncludeFirstClear] = useState<boolean>(
    savedShopState?.includeFirstClear ?? false
  );
  const [extraStageRuns, setExtraStageRuns] = useState<Record<string, number>>(
    savedShopState?.extraStageRuns ?? {}
  );

  const [appliedBonusRatio, setAppliedBonusRatio] = useState<Record<string, Decimal>>({});

  // Initialize lastSavedStateRef on mount with the initial saved state
  useEffect(() => {
    if (savedShopState && lastSavedStateRef.current === null) {
      lastSavedStateRef.current = savedShopState;
      setIsInitialLoad(false);
    } else if (!savedShopState) {
      // No saved state - mark initialization as complete after a brief delay
      // This ensures state is fully initialized before starting auto-save
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []); // Only run on mount

  // Prevent re-render from revalidation: ignore savedShopState changes if they match what we last saved
  const prevSavedShopStateRef = useRef(savedShopState);
  useEffect(() => {
    if (savedShopState && savedShopState !== prevSavedShopStateRef.current) {
      const newState = savedShopState;
      prevSavedShopStateRef.current = newState;

      // Only update state if it matches what we last saved (confirmation from server)
      // or if we haven't saved anything yet (initial load)
      // This prevents re-render from revalidation when we save
      if (lastSavedStateRef.current === null) {
        // Initial load - apply saved state
        setItemQuantities(newState.itemQuantities);
        setSelectedBonusStudentUids(newState.selectedBonusStudentUids);
        setIncludeRecruitedStudents(newState.includeRecruitedStudents);
        setEnabledStages(newState.enabledStages);
        setExistingPaymentItemQuantities(newState.existingPaymentItemQuantities || {});
        setIncludeFirstClear(newState.includeFirstClear ?? false);
        setExtraStageRuns(newState.extraStageRuns || {});
        lastSavedStateRef.current = newState;
        setIsInitialLoad(false);
      } else {
        // Check if this matches what we last saved
        const stateMatches = JSON.stringify(lastSavedStateRef.current) === JSON.stringify(newState);
        if (stateMatches) {
          // This is a revalidation from our own save - ignore it to prevent re-render
          // Update the ref to the new state object reference
          lastSavedStateRef.current = newState;
        }
        // If it doesn't match, user might have changed data in another tab/session
        // But we don't apply it to avoid overwriting current user's changes
      }
    } else if (!savedShopState) {
      prevSavedShopStateRef.current = null;
      lastSavedStateRef.current = null;
    }
  }, [savedShopState]);

  // Periodic save check: every 3 seconds, check if state changed and save if needed
  useEffect(() => {
    if (!signedIn || isInitialLoad) {
      return;
    }

    // Clear any existing interval
    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current);
    }

    // Set up interval to check for changes every 3 seconds
    saveIntervalRef.current = setInterval(() => {
      // Build current state
      const currentState: EventShopState = {
        itemQuantities,
        selectedBonusStudentUids,
        enabledStages,
        includeRecruitedStudents,
        existingPaymentItemQuantities,
        includeFirstClear,
        extraStageRuns,
      };

      // Check if state has changed compared to what we last saved
      const hasChanged = lastSavedStateRef.current === null ||
        JSON.stringify(lastSavedStateRef.current) !== JSON.stringify(currentState);

      // Only save if there are changes and we're not already saving
      if (hasChanged && fetcher.state === "idle") {
        // Track what we're saving
        lastSavedStateRef.current = currentState;

        // Submit the save
        fetcher.submit(
          { save: currentState },
          { method: "post", action: `/api/events/${eventUid}/shop-state`, encType: "application/json" }
        );
      }
    }, 1500);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, [itemQuantities, selectedBonusStudentUids, enabledStages, includeRecruitedStudents, existingPaymentItemQuantities, includeFirstClear, extraStageRuns, signedIn, eventUid, fetcher, isInitialLoad]);

  const paymentItemQuantities = useMemo(() => {
    const quantities: Record<string, number> = {};
    collectableResources.forEach(({ uid, forPayment }) => {
      if (!forPayment) {
        return;
      }

      const required = shopResources.reduce((total, { uid: shopResourceUid, paymentResourceAmount, paymentResource }) => {
        if (paymentResource.uid !== uid) {
          return total;
        }
        return total + ((itemQuantities[shopResourceUid] || 0) * paymentResourceAmount);
      }, 0);
      const existing = existingPaymentItemQuantities[uid] || 0;
      quantities[uid] = Math.max(0, required - existing);
    });
    return quantities;
  }, [collectableResources, itemQuantities, shopResources, existingPaymentItemQuantities]);

  const isSaving = fetcher.state === "submitting" || fetcher.state === "loading";

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
          selectedBonusStudentUids={selectedBonusStudentUids}
          setSelectedBonusStudentUids={setSelectedBonusStudentUids}
          setAppliedBonusRatio={setAppliedBonusRatio}
          includeRecruitedStudents={includeRecruitedStudents}
          setIncludeRecruitedStudents={setIncludeRecruitedStudents}
          signedIn={signedIn}
        />

        {collectableResources && (
          <ShopResourceSelector
            shopResources={shopResources}
            collectableResources={collectableResources}
            itemQuantities={itemQuantities}
            setItemQuantities={setItemQuantities}
            paymentItemQuantities={paymentItemQuantities}
            existingPaymentItemQuantities={existingPaymentItemQuantities}
            setExistingPaymentItemQuantities={setExistingPaymentItemQuantities}
          />
        )}

        <StageSelector
          stages={stages}
          appliedBonusRatio={appliedBonusRatio}
          paymentItemQuantities={paymentItemQuantities}
          enabledStages={enabledStages}
          setEnabledStages={setEnabledStages}
          includeFirstClear={includeFirstClear}
          setIncludeFirstClear={setIncludeFirstClear}
          extraStageRuns={extraStageRuns}
          setExtraStageRuns={setExtraStageRuns}
          existingPaymentItemQuantities={existingPaymentItemQuantities}
          itemQuantities={itemQuantities}
          shopResources={shopResources}
        />
      </div>
    </>
  );
}
