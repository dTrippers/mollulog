import type {
  CardFlipCard,
  CardFlipStrategy,
  CollectableResource,
  MinigameConfig,
  MinigamePayment,
  RewardItem,
} from "~/domain/event-shop";
import { cardFlipLocale, getCardFlipRarity } from "~/locales/ko";
import { buildResourceBreakdownLines, type ResourceBreakdownLines } from "./calculations/resource-breakdown-lines";
import type { ItemBreakdownResult } from "./calculations/types";
import { resourceCountLabel } from "./utils";

export function formatCardFlipAmount(quantity: number): string {
  return resourceCountLabel(Math.round(quantity));
}

export type CardFlipPlanSummary = {
  cardCount: number;
  strategy: CardFlipStrategy;
  costs: MinigamePayment[];
  rewards: RewardItem[];
  resources: { resource: CollectableResource; breakdown: ResourceBreakdownLines }[];
};

type SummarizeCardFlipPlanInput = {
  config: MinigameConfig;
  cardCount: number;
  strategy: CardFlipStrategy;
  costs: MinigamePayment[];
  rewards: RewardItem[];
  collectableResources: CollectableResource[];
  itemBreakdown: ItemBreakdownResult["itemBreakdown"];
  overriddenRequiredQuantities: Record<string, number>;
};

export function summarizeCardFlipPlan({
  config,
  cardCount,
  strategy,
  costs,
  rewards,
  collectableResources,
  itemBreakdown,
  overriddenRequiredQuantities,
}: SummarizeCardFlipPlanInput): CardFlipPlanSummary | null {
  if (cardCount <= 0 || config.minigameType !== "card_flip" || config.cardFlip?.status !== "available") {
    return null;
  }

  const costResourceUids = new Set(costs.map(({ resourceUid }) => resourceUid));
  const rewardResourceUids = new Set(rewards.map(({ resourceUid }) => resourceUid));
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

  return { cardCount, strategy, costs, rewards, resources };
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
