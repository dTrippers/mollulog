import type Decimal from "decimal.js";
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
import type { CalculationResult } from "~/domain/event-shop/calculations";
import type { ClueSearchExchange } from "~/domain/event-shop/clue-search";
import type {
  TreasureHuntCalculationStatus,
  TreasureHuntEstimate,
  TreasureHuntHistogramState,
  TreasureHuntRoundRow,
} from "~/domain/event-shop/treasure-hunt";
import type { RoadPuzzleStatsCalculation } from "~/lib/event-shop/hooks/useRoadPuzzleStats";
import type { ShopActions, ShopState } from "~/lib/event-shop/hooks/useShopState";
import type { BonusSummary } from "~/lib/event-shop/hooks/useBonusCalculation";

export type TreasureHuntSectionState = {
  status: TreasureHuntCalculationStatus;
  progress: number | null;
  rows: TreasureHuntRoundRow[];
  statsBySignature: Readonly<Record<string, TreasureHuntHistogramState>>;
  estimate: TreasureHuntEstimate | null;
  retry: () => void;
};

export type EventShopPlanContext = {
  stages: Stage[];
  shopResources: ShopResource[];
  ownedQuantities: Record<string, number> | null;
  eventRewardBonus: EventRewardBonus[];
  appliedBonusRatio: Record<string, Decimal>;
  bonusSummary?: BonusSummary[];
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
  roadPuzzleCalculation: RoadPuzzleStatsCalculation;
  holdRoadPuzzleCalculations: boolean;
  roadPuzzlePlannerStatus?: "pending" | "failed" | "missing";
  resultTreasureHuntStatus: Extract<TreasureHuntCalculationStatus, "pending" | "provisional" | "failed" | "round-limit"> | undefined;
  provisionalMinigameResourceUid?: string;
  minigamePaymentCosts: MinigamePayment[] | undefined;
  minigameRewards: RewardItem[] | undefined;
  cardFlipComparison: CardFlipStrategyResult[] | null;
  stageCalculations: CalculationResult;
  isCalculating: boolean;
  isSaving?: boolean;
  saveError?: string | null;
  retrySave?: () => void;
};
