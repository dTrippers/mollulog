import type Decimal from "decimal.js";
import type { MinigameConfig, MinigamePayment, ShopResource, Stage } from "~/domain/event-shop";

export type StageInfo = {
  uid: string;
  index: string;
  entryAp: Decimal;
  rewardPerItem: Record<string, Decimal>;
};

export type OptimizationResult = {
  stageRuns: Record<string, number>;
  totalAp: Decimal;
  unobtainableTargets: Record<string, number>;
};

export type ResourceLedger = {
  requiredForShopItems: Record<string, number>;
  requiredForMinigame: Record<string, number>;
  requiredTotals: Record<string, number>;
  existing: Record<string, number>;
  fromFirstRun: Record<string, number>;
  fromShop: Record<string, number>;
  fromMinigame: Record<string, number>;
  acquiredBeforeSweeps: Record<string, number>;
  remainingToFarm: Record<string, number>;
};

export type ItemBreakdownInput = {
  stages: Stage[];
  enabledStages: Record<string, boolean>;
  stageRuns: Record<string, number>;
  extraStageRuns: Record<string, number>;
  appliedBonusRatio: Record<string, Decimal>;
  includeFirstClear: boolean;
  resourceLedger: ResourceLedger;
};

export type ItemBreakdownResult = {
  totalAp: number;
  firstClearAp: number;
  questSweepAp: number;
  extraSweepAp: number;
  totalApWithExtras: number;
  itemBreakdown: {
    fromFirstRun: Record<string, number>;
    fromRepeatedRuns: Record<string, number>;
    existing: Record<string, number>;
    fromShop: Record<string, number>;
    toPlayMinigame: Record<string, number>;
    toBuyShopItems: Record<string, number>;
    fromMinigame: Record<string, number>;
    remaining: Record<string, number>;
  };
};

export type RequiredQuantitiesInput = {
  shopResources: ShopResource[];
  itemQuantities: Record<string, number>;
  itemPurchaseDays: Record<string, number>;
  existingPaymentItemQuantities: Record<string, number>;
  stages: Stage[];
  includeFirstClear: boolean;
  minigamePlayCount: number;
  minigameConfig?: MinigameConfig | null;
  minigamePaymentCosts?: MinigamePayment[];
  overriddenRequiredQuantities?: Record<string, number>;
};
