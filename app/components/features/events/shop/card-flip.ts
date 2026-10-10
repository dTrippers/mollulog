import type {
  CardFlipCard,
  CollectableResource,
  MinigameConfig,
  MinigamePayment,
  RewardItem,
} from "~/domain/event-shop";
import { cardFlipLocale, getCardFlipRarity } from "~/locales/ko";
import { buildResourceBreakdownLines, type ResourceBreakdownLines } from "./calculations/resource-breakdown-lines";
import type { ItemBreakdownResult } from "./calculations/types";
import { calculateMinigamePaymentCosts, calculateMinigameRewards } from "./utils";

type ItemBreakdown = ItemBreakdownResult["itemBreakdown"];

export type CardFlipPlanSummary = {
  cardCount: number;
  perCardCosts: MinigamePayment[];
  totalCosts: MinigamePayment[];
  averageRewards: RewardItem[];
  resources: { resource: CollectableResource; breakdown: ResourceBreakdownLines }[];
};

type SummarizeCardFlipPlanInput = {
  config: MinigameConfig;
  cardCount: number;
  collectableResources: CollectableResource[];
  itemBreakdown: ItemBreakdown;
  overriddenRequiredQuantities: Record<string, number>;
};

export function summarizeCardFlipPlan({
  config,
  cardCount,
  collectableResources,
  itemBreakdown,
  overriddenRequiredQuantities,
}: SummarizeCardFlipPlanInput): CardFlipPlanSummary | null {
  if (cardCount <= 0) {
    return null;
  }

  const perCardCosts = calculateMinigamePaymentCosts(config, 1);
  const totalCosts = calculateMinigamePaymentCosts(config, cardCount);
  const averageRewards = calculateMinigameRewards(config, cardCount);
  const cardFlipData = config.cardFlip?.status === "available" ? config.cardFlip : null;
  const costResourceUids = new Set([
    ...(cardFlipData ? [cardFlipData.cardCost.resourceUid] : []),
    ...perCardCosts.map(({ resourceUid }) => resourceUid),
  ]);
  const rewardResourceUids = new Set(averageRewards.map(({ resourceUid }) => resourceUid));
  const relevantResources = collectableResources.filter(
    ({ uid }) => costResourceUids.has(uid) || rewardResourceUids.has(uid),
  );
  const resources = [
    ...relevantResources.filter(({ uid }) => costResourceUids.has(uid)),
    ...relevantResources.filter(({ uid }) => !costResourceUids.has(uid) && rewardResourceUids.has(uid)),
  ].map((resource) => {
    const breakdown = buildResourceBreakdownLines(itemBreakdown, resource.uid, overriddenRequiredQuantities, {
      minigameRequired: cardFlipLocale.minigameRequiredLabel,
      minigameAcquired: cardFlipLocale.averageMinigameLabel,
    });
    return { resource, breakdown };
  });

  return { cardCount, perCardCosts, totalCosts, averageRewards, resources };
}

export function cardFlipCardAccessibleName(card: CardFlipCard): string {
  const identity: string[] = [];
  if (card.name) {
    identity.push(card.name);
  }
  const rarity = getCardFlipRarity(card.rarity);
  if (rarity) {
    identity.push(`${rarity.text} 등급`);
  }

  const rewards = card.rewards.map(({ resourceName, quantity }) => {
    const itemName = resourceName ? `${resourceName} ` : "";
    return `${itemName}${quantity.toLocaleString()}개`;
  });
  return `${identity.length > 0 ? `${identity.join(", ")}, ` : ""}${rewards.join(", ")}`;
}
