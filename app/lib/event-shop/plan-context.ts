import type Decimal from "decimal.js";
import type { CardFlipStrategyResult } from "~/domain/card-flip-strategy";
import type {
  CollectableResource,
  EventRewardBonus,
  MinigameConfig,
  MinigamePayment,
  RewardItem,
  ShopResource,
  Stage,
} from "~/domain/event-shop";
import type { CalculationResult } from "~/domain/event-shop/calculations";
import type { JankenDefaultProgress, JankenEvaluation } from "~/domain/event-shop/janken";
import type { JankenPlannerEntry } from "~/domain/planner-state";
import type { ClueSearchExchange } from "~/domain/event-shop/clue-search";
import type {
  TreasureHuntCalculationStatus,
  TreasureHuntEstimate,
  TreasureHuntHistogramState,
  TreasureHuntRoundRow,
} from "~/domain/event-shop/treasure-hunt";
import type { SavedShopStateSource } from "~/domain/event-shop-state-key";
import type { BonusSummary } from "~/lib/event-shop/hooks/useBonusCalculation";
import type { RoadPuzzleStatsCalculation } from "~/lib/event-shop/hooks/useRoadPuzzleStats";
import type { ShopActions, ShopState } from "~/lib/event-shop/hooks/useShopState";

export type TreasureHuntSectionState = {
  status: TreasureHuntCalculationStatus;
  progress: number | null;
  rows: TreasureHuntRoundRow[];
  statsBySignature: Readonly<Record<string, TreasureHuntHistogramState>>;
  estimate: TreasureHuntEstimate | null;
  retry: () => void;
};

export type JankenPlannerPersistenceState = {
  hasSavedEntry: boolean;
  isSaving: boolean;
  saveError: string | null;
  isConflict: boolean;
  conflictError: string | null;
  reloadLatest: () => void;
  overwrite: () => void;
  retrySave: () => void;
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
  jankenEntry: JankenPlannerEntry;
  setJankenEntry: (entry: JankenPlannerEntry) => void;
  savedJankenEntry: JankenPlannerEntry | null;
  jankenDefaultProgress: JankenDefaultProgress;
  jankenPlan: JankenEvaluation;
  jankenShopCurrency: { uid: string | null; required: number; total: number; owned: number };
  jankenPersistence: JankenPlannerPersistenceState;
  state: ShopState;
  actions: ShopActions;
  minigameConfig: MinigameConfig | null;
  jankenStudentGrowthUid?: string | null;
  minigameConfigForCalculations: MinigameConfig | null;
  collectableResources: CollectableResource[];
  clueSearchExchange: ClueSearchExchange | null;
  treasureHuntCalculation: TreasureHuntSectionState;
  holdTreasureHuntCalculations: boolean;
  roadPuzzleCalculation: RoadPuzzleStatsCalculation;
  holdRoadPuzzleCalculations: boolean;
  roadPuzzlePlannerStatus?: "pending" | "failed" | "missing";
  resultTreasureHuntStatus:
    | Extract<TreasureHuntCalculationStatus, "pending" | "provisional" | "failed" | "round-limit">
    | undefined;
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
