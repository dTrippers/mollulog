import { ExclamationCircleIcon, UserIcon } from "@heroicons/react/16/solid";
import type Decimal from "decimal.js";
import { useSignIn } from "~/contexts/SignInProvider";
import type {
  CollectableResource,
  EventRewardBonus,
  MinigameConfig,
  MinigamePayment,
  RewardItem,
  ShopResource,
  Stage,
} from "~/domain/event-shop";
import type { CardFlipStrategyResult } from "~/domain/card-flip-strategy";
import type { SavedShopStateSource } from "~/domain/event-shop-state-key";
import EventInfoCard from "../EventInfoCard";
import { CollectedTotalsSection } from "./CollectedTotalsSection";
import type { ClueSearchExchange } from "./clue-search";
import type { CalculationResult } from "./hooks/useShopCalculations";
import type { ShopActions, ShopState } from "./hooks/useShopState";
import { MiniGameSection } from "./MiniGameSection";
import { ShopResourceSelector } from "./ShopResourceSelector";
import { StageSelector } from "./StageSelector";
import { StudentBonusSelector } from "./StudentBonusSelector";
import type { TreasureHuntSectionState } from "./TreasureHuntSection";

type TreasureHuntResultStatus = "pending" | "provisional" | "failed" | "round-limit" | undefined;

export type EventShopPlanContext = {
  stages: Stage[];
  shopResources: ShopResource[];
  ownedQuantities: Record<string, number> | null;
  eventRewardBonus: EventRewardBonus[];
  appliedBonusRatio: Record<string, Decimal>;
  recruitedStudentUids: string[];
  eventUid: string;
  shopStateUid: string;
  savedShopStateSource: SavedShopStateSource;
  availablePurchaseDays: number;
  signedIn: boolean;
  state: ShopState;
  actions: ShopActions;
  minigameConfig: MinigameConfig | null;
  minigameConfigForCalculations: MinigameConfig | null;
  collectableResources: CollectableResource[];
  clueSearchExchange: ClueSearchExchange | null;
  treasureHuntCalculation: TreasureHuntSectionState;
  holdTreasureHuntCalculations: boolean;
  resultTreasureHuntStatus: TreasureHuntResultStatus;
  provisionalMinigameResourceUid?: string;
  minigamePaymentCosts: MinigamePayment[] | undefined;
  minigameRewards: RewardItem[] | undefined;
  cardFlipComparison: CardFlipStrategyResult[] | null;
  stageCalculations: CalculationResult;
  isCalculating: boolean;
};

export function ShopCalculatorScreen({
  stages,
  shopResources,
  ownedQuantities,
  eventRewardBonus,
  appliedBonusRatio,
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
  provisionalMinigameResourceUid,
  minigameRewards,
  cardFlipComparison,
  stageCalculations,
}: EventShopPlanContext) {
  const { showSignIn } = useSignIn();

  return (
    <>
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

      <div className="space-y-8">
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
            ownedQuantities={ownedQuantities}
            collectableResources={collectableResources}
            eventUid={shopStateUid}
            state={state}
            actions={actions}
            availablePurchaseDays={availablePurchaseDays}
          />
        )}

        {minigameConfig && (
          <MiniGameSection
            config={minigameConfig}
            eventUid={eventUid}
            state={state}
            actions={actions}
            exchange={clueSearchExchange}
            treasureHuntCalculation={treasureHuntCalculation}
            cardFlipComparison={cardFlipComparison}
          />
        )}
        <StageSelector
          stages={stages}
          appliedBonusRatio={appliedBonusRatio}
          stageRuns={holdTreasureHuntCalculations ? {} : stageCalculations.stageRuns}
          state={state}
          actions={actions}
          treasureHuntStatus={resultTreasureHuntStatus}
          onRetryTreasureHunt={treasureHuntCalculation.retry}
        />

        <CollectedTotalsSection
          stages={stages}
          collectableResources={collectableResources}
          shopResources={shopResources}
          eventUid={eventUid}
          shopStateUid={shopStateUid}
          savedShopStateSource={savedShopStateSource}
          minigameConfig={minigameConfigForCalculations}
          minigameRewards={minigameRewards}
          treasureHuntStatus={resultTreasureHuntStatus}
          onRetryTreasureHunt={treasureHuntCalculation.retry}
          provisionalMinigameResourceUid={provisionalMinigameResourceUid}
          state={state}
          actions={actions}
          stageCalculations={stageCalculations}
          signedIn={signedIn}
        />
      </div>
    </>
  );
}
