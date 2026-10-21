import type { CollectableResource, MinigameConfig, ShopResource, Stage } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { ClueSearchExchange } from "../clue-search";
import { getTreasureHuntCellCostResources } from "../treasure-hunt";

type BuildCollectableResourcesInput = {
  shopResources: ShopResource[];
  stages: Stage[];
  minigameConfig: MinigameConfig | null;
  clueSearchExchange: ClueSearchExchange | null;
};

// Collectable resources are the event currencies the planner farms: shop payments, stage coin drops, minigame
// payments and clue search points. Every entry becomes a 필요/획득/남은 수량 card in the final result.
// Minigame rewards must never be added here. Rewards that are event currencies are already counted per uid in the
// ledger's fromMinigame, and every reward is listed under 획득 보상.
export function buildCollectableResources({
  shopResources,
  stages,
  minigameConfig,
  clueSearchExchange,
}: BuildCollectableResourcesInput): CollectableResource[] {
  const items: CollectableResource[] = [];
  const add = (item: CollectableResource) => {
    if (!items.some(({ uid }) => uid === item.uid)) {
      items.push(item);
    }
  };

  for (const { paymentResource, purchaseTiers } of shopResources) {
    for (const { type, uid, name, imageUrl } of [
      paymentResource,
      ...purchaseTiers.map((tier) => tier.paymentResource),
    ]) {
      add({ type, uid, name, imageUrl, forPayment: true });
    }
  }

  for (const stage of stages) {
    for (const { item } of stage.rewards) {
      if (item && item.category === "coin") {
        add({ type: ResourceTypeEnum.Item, uid: item.uid, name: item.name, forPayment: false });
      }
    }
  }

  if (!minigameConfig) {
    return items;
  }

  if (minigameConfig.minigameType === "treasure_hunt") {
    for (const payment of getTreasureHuntCellCostResources(minigameConfig.treasureHunt?.rounds ?? [])) {
      add({
        type: payment.resourceType,
        uid: payment.resourceUid,
        name: payment.resourceName ?? "재화",
        imageUrl: payment.imageUrl,
        forPayment: false,
      });
    }
    return items;
  }

  const minigamePaymentResources = [
    minigameConfig.payment,
    ...minigameConfig.payments,
    ...minigameConfig.rewardGroups.flatMap((group) => group.payments),
  ];
  for (const { resourceType, resourceUid, resourceName, imageUrl } of minigamePaymentResources) {
    if (clueSearchExchange?.supported && clueSearchExchange.clueUids.includes(resourceUid)) {
      continue;
    }
    add({ type: resourceType, uid: resourceUid, name: resourceName ?? "재화", imageUrl, forPayment: false });
  }

  if (clueSearchExchange?.supported && clueSearchExchange.pointResource) {
    const { type, uid, name, imageUrl } = clueSearchExchange.pointResource;
    add({ type, uid, name, imageUrl, forPayment: false });
  }

  return items;
}
