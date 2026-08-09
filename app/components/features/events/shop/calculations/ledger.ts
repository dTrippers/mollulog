import Decimal from "decimal.js";
import { FIRST_CLEAR_REWARD_REQUIREMENT } from "~/domain/event-shop";
import { calculateMinigameRewards } from "../utils";
import { calculateShopResourcePaymentCosts } from "./shop-costs";
import { calculateBoughtResourceQuantities } from "./shop-rewards";
import type { RequiredQuantitiesInput, ResourceLedger } from "./types";

type DecimalMap = Record<string, Decimal>;

function addQuantity(target: DecimalMap, uid: string, quantity: number) {
  if (quantity === 0) {
    return;
  }

  target[uid] = (target[uid] ?? new Decimal(0)).plus(quantity);
}

function toNumberMap(source: DecimalMap): Record<string, number> {
  return Object.fromEntries(
    Object.entries(source)
      .filter(([, quantity]) => !quantity.isZero())
      .map(([uid, quantity]) => [uid, quantity.toNumber()]),
  );
}

function sumQuantityMaps(...sources: DecimalMap[]): DecimalMap {
  const result: DecimalMap = {};
  for (const source of sources) {
    for (const [uid, quantity] of Object.entries(source)) {
      addQuantity(result, uid, quantity.toNumber());
    }
  }
  return result;
}

/**
 * Builds the resource ledger used by both stage optimization and result display.
 * Only exchanges explicitly selected by the user are applied.
 */
export function calculateResourceLedger({
  shopResources,
  itemQuantities,
  itemPurchaseDays,
  existingPaymentItemQuantities,
  stages,
  includeFirstClear,
  minigameStartRound,
  minigamePlayCount,
  minigameConfig,
  minigamePaymentCosts,
  excludedShopResourceUids,
  overriddenRequiredQuantities,
}: RequiredQuantitiesInput): ResourceLedger {
  const excludedShopResourceUidSet = new Set(excludedShopResourceUids ?? []);
  const visibleShopResources = shopResources.filter(({ uid }) => !excludedShopResourceUidSet.has(uid));
  const requiredForShopItems: DecimalMap = {};
  for (const shopResource of visibleShopResources) {
    const costs = calculateShopResourcePaymentCosts(
      shopResource,
      itemQuantities[shopResource.uid] ?? 0,
      itemPurchaseDays[shopResource.uid] ?? 0,
    );
    for (const { resource, amount } of costs) {
      addQuantity(requiredForShopItems, resource.uid, amount);
    }
  }

  const requiredForMinigame: DecimalMap = {};
  if (minigamePlayCount > 0) {
    for (const { resourceUid, quantity } of minigamePaymentCosts ?? []) {
      addQuantity(requiredForMinigame, resourceUid, quantity);
    }
  }

  const requiredTotals = sumQuantityMaps(requiredForShopItems, requiredForMinigame);
  for (const [uid, quantity] of Object.entries(overriddenRequiredQuantities ?? {})) {
    requiredTotals[uid] = new Decimal(Math.max(0, quantity));
  }

  const existing: DecimalMap = {};
  for (const [uid, quantity] of Object.entries(existingPaymentItemQuantities)) {
    addQuantity(existing, uid, quantity);
  }

  const fromFirstRun: DecimalMap = {};
  if (includeFirstClear) {
    for (const stage of stages) {
      for (const { item, amount, rewardRequirement } of stage.rewards) {
        if (item?.category !== "coin") {
          continue;
        }
        if (rewardRequirement === FIRST_CLEAR_REWARD_REQUIREMENT || stage.difficulty === 0) {
          addQuantity(fromFirstRun, item.uid, amount);
        }
      }
    }
  }

  const fromShop: DecimalMap = {};
  for (const { resource, totalQuantity } of calculateBoughtResourceQuantities(
    visibleShopResources,
    itemQuantities,
    itemPurchaseDays,
  )) {
    addQuantity(fromShop, resource.uid, totalQuantity);
  }

  const fromMinigame: DecimalMap = {};
  if (minigameConfig && minigamePlayCount > 0) {
    for (const { resourceUid, quantity } of calculateMinigameRewards(
      minigameConfig,
      minigamePlayCount,
      minigameStartRound ?? 1,
    )) {
      addQuantity(fromMinigame, resourceUid, quantity);
    }
  }

  const acquiredBeforeSweeps = sumQuantityMaps(existing, fromFirstRun, fromShop, fromMinigame);
  const remainingToFarm: DecimalMap = {};
  for (const [uid, required] of Object.entries(requiredTotals)) {
    const remaining = required.minus(acquiredBeforeSweeps[uid] ?? 0);
    if (remaining.gt(0)) {
      remainingToFarm[uid] = remaining;
    }
  }

  return {
    requiredForShopItems: toNumberMap(requiredForShopItems),
    requiredForMinigame: toNumberMap(requiredForMinigame),
    requiredTotals: toNumberMap(requiredTotals),
    existing: toNumberMap(existing),
    fromFirstRun: toNumberMap(fromFirstRun),
    fromShop: toNumberMap(fromShop),
    fromMinigame: toNumberMap(fromMinigame),
    acquiredBeforeSweeps: toNumberMap(acquiredBeforeSweeps),
    remainingToFarm: toNumberMap(remainingToFarm),
  };
}
