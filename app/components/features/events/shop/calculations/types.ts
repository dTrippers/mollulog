import type Decimal from "decimal.js";
import type { MinigameConfig, MinigamePayment } from "~/domain/event-shop";
import type { CollectableResource, ShopResource, Stage } from "~/domain/event-shop";
import type { ResourceTypeEnum } from "~/graphql/graphql";

export type StageInfo = {
  uid: string;
  index: string;
  entryAp: Decimal;
  rewardPerItem: Record<string, Decimal>;
  contributes: boolean;
};

export type OptimizationResult = {
  stageRuns: Record<string, number>;
  totalAp: Decimal;
};

export type ItemBreakdownInput = {
  stages: Stage[];
  enabledStages: Record<string, boolean>;
  stageRuns: Record<string, number>;
  extraStageRuns: Record<string, number>;
  appliedBonusRatio: Record<string, Decimal>;
  paymentItemQuantities: Record<string, number>;
  includeFirstClear: boolean;
  minigamePlayCount: number;
  minigameConfig?: MinigameConfig | null;
  minigameRewards?: Record<string, { resourceType: unknown; resourceUid: string; quantity: number }[]>;
  shopResources: ShopResource[];
  itemQuantities: Record<string, number>;
  itemPurchaseDays: Record<string, number>;
  collectableResources: CollectableResource[];
  minigamePaymentCosts?: MinigamePayment[];
};

export type ItemBreakdownResult = {
  totalAp: number;
  firstClearAp: number;
  questSweepAp: number;
  extraSweepAp: number;
  totalApWithExtras: number;
  collectedTotals: Record<string, number>;
  itemBreakdown: {
    fromFirstRun: Record<string, number>;
    fromRepeatedRuns: Record<string, number>;
    toPlayMinigame: Record<string, number>;
    toBuyShopItems: Record<string, number>;
    fromMinigame: Record<string, number>;
    remaining: Record<string, number>;
  };
};

export type RequiredQuantitiesInput = {
  shopResources: ShopResource[];
  collectableResources: CollectableResource[];
  itemQuantities: Record<string, number>;
  itemPurchaseDays: Record<string, number>;
  existingPaymentItemQuantities: Record<string, number>;
  stages: Stage[];
  includeFirstClear: boolean;
  minigamePlayCount: number;
  minigameConfig?: MinigameConfig | null;
  minigameRewards?: { resourceType: ResourceTypeEnum; resourceUid: string; quantity: number }[];
  minigamePaymentCosts?: MinigamePayment[];
  enabledStages?: Record<string, boolean>;
  appliedBonusRatio?: Record<string, Decimal>;
  overriddenRequiredQuantities?: Record<string, number>;
};
