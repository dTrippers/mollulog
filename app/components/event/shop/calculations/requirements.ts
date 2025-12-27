import Decimal from "decimal.js";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { RequiredQuantitiesInput } from "./types";
import { MINIGAME_CONFIG } from "../constants";
import { calculateMinigameRewards } from "../utils";

/**
 * Calculates the required quantities of payment items, resolving recursive dependencies (items buying items).
 */
export function calculateRequiredQuantities({
  shopResources,
  collectableResources,
  itemQuantities,
  existingPaymentItemQuantities,
  stages,
  includeFirstClear,
  minigamePlayCount,
  minigameRewards,
  minigameCostItemUid,
  minigameCostAmount = 2000,
  enabledStages,
  appliedBonusRatio,
  overriddenRequiredQuantities,
  eventUid,
}: RequiredQuantitiesInput): Record<string, number> {
  // Find which items can be farmed from stages (to avoid converting them)
  const farmableItems = new Set<string>();
  if (enabledStages && appliedBonusRatio) {
    stages.filter((stage) => enabledStages[stage.uid]).forEach((stage) => {
      stage.rewards.forEach(({ item, rewardRequirement }) => {
        if (item && item.category === "coin" && rewardRequirement === null) {
          farmableItems.add(item.uid);
        }
      });
    });
  }

  // 1. Calculate initial requirements based on what the user wants to buy
  // Check for overridden values first - if an item has an override, use that instead of calculating
  const requirements: Record<string, Decimal> = {};

  // First, apply any overridden required quantities
  if (overriddenRequiredQuantities) {
    for (const [uid, qty] of Object.entries(overriddenRequiredQuantities)) {
      if (qty > 0) {
        requirements[uid] = new Decimal(qty);
      }
    }
  }

  // Then, calculate requirements for items that don't have overrides
  for (const { uid, forPayment } of collectableResources) {
    if (!forPayment) {
      continue;
    }

    // Skip if this item already has an override
    if (overriddenRequiredQuantities && overriddenRequiredQuantities[uid] !== undefined) {
      continue;
    }

    const required = shopResources.reduce((total, { uid: shopResourceUid, paymentResourceAmount, paymentResource }) => {
      if (paymentResource.uid !== uid) {
        return total;
      }
      return total + ((itemQuantities[shopResourceUid] || 0) * paymentResourceAmount);
    }, 0);

    if (required > 0) {
      requirements[uid] = (requirements[uid] || new Decimal(0)).plus(required);
    }
  }

  // Add minigame cost to requirements (only if not overridden)
  if (minigameRewards && minigamePlayCount > 0 && minigameCostItemUid) {
    // Only add if this item doesn't have an override
    if (!overriddenRequiredQuantities || overriddenRequiredQuantities[minigameCostItemUid] === undefined) {
      const current = requirements[minigameCostItemUid] || new Decimal(0);
      requirements[minigameCostItemUid] = current.plus(minigamePlayCount * minigameCostAmount);
    }
  }

  // 2. Subtract already collected amounts (Inventory, First Clear, Minigame Rewards)
  const collected: Record<string, Decimal> = {};

  // Inventory
  for (const [uid, qty] of Object.entries(existingPaymentItemQuantities)) {
    collected[uid] = (collected[uid] || new Decimal(0)).plus(qty);
  }

  // First Clear
  if (includeFirstClear) {
    for (const stage of stages) {
      for (const { item, amount, rewardRequirement } of stage.rewards) {
        if (!item || item.category !== "coin") {
          continue;
        }
        if (rewardRequirement === "first_clear" || stage.difficulty === 0) { // first_clear or story
          collected[item.uid] = (collected[item.uid] || new Decimal(0)).plus(amount);
        }
      }
    }
  }

  // Minigame Rewards (as source of payment items)
  const minigameConfig = MINIGAME_CONFIG[eventUid];
  if (minigameConfig && minigamePlayCount > 0) {
    const rewards = calculateMinigameRewards(minigameConfig, minigamePlayCount);
    for (const { resourceUid, quantity } of rewards) {
      // Check if this resource is a payment item
      if (collectableResources.some((r) => r.uid === resourceUid && r.forPayment)) {
        collected[resourceUid] = (collected[resourceUid] || new Decimal(0)).plus(quantity);
      }
    }
  }

  // Apply collected to requirements
  for (const uid of Object.keys(requirements)) {
    if (collected[uid]) {
      requirements[uid] = requirements[uid].minus(collected[uid]);
      // If less than 0, it means we have surplus. We don't carry over surplus to other items (unless exchange?).
      // For now, just max(0).
      if (requirements[uid].lt(0)) {
        requirements[uid] = new Decimal(0);
      }
    }
  }

  // 3. Recursive Resolution
  // If we require Item B, and Item B can be bought with Item A, convert requirement.
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 10) {
    changed = false;
    iterations++;

    const currentRequirements = { ...requirements };
    for (const [reqUid, reqAmount] of Object.entries(currentRequirements)) {
      if (reqAmount.lte(0)) continue;

      // Don't convert items that can be farmed from stages - farm them instead!
      if (farmableItems.has(reqUid)) {
        continue;
      }

      // Check if this item is sold in the shop
      // Find shop definitions where 'resource' is this item
      // We need to match on shopResource.resource.uid === reqUid
      // Priority: Infinite stock (shopAmount === null)
      const shopEntries = shopResources.filter(s => s.resource.uid === reqUid && s.resource.type === ResourceTypeEnum.Item);
      // Note: shopResource.resource.type check is good but might need proper enum import or just string check if simple.
      // Using 'as any' to avoid import issues for now, or just check string.

      // Sort: Infinite stock first
      shopEntries.sort((a, b) => {
        if (a.shopAmount === null && b.shopAmount !== null) return -1;
        if (a.shopAmount !== null && b.shopAmount === null) return 1;
        return 0;
      });

      const entry = shopEntries[0];
      if (entry) {
        // Can convert
        // logic: we need 'reqAmount' of 'reqUid'.
        // entry sells 'entry.resourceAmount' of 'reqUid' for 'entry.paymentResourceAmount' of 'entry.paymentResource.uid'.

        // IMPORTANT: Don't convert to farmable items - farm them directly instead!
        // If the payment item is farmable, we should NOT convert. Instead, keep the original requirement
        // and let the optimization algorithm farm the payment item directly.
        const payUid = entry.paymentResource.uid;
        if (farmableItems.has(payUid)) {
          continue; // Skip this conversion, keep the original requirement
        }

        // We assume we convert ALL pending requirements using this exchange.
        // What if limited stock?
        // We don't track how much of the limit was used by THIS recursive logic vs generic "buy from shop" logic.
        // But since this is a "required quantities" calculation, we can assume we use available stock.
        // For simplicity/MVP as requested: support conversion.
        // If filtered to infinite stock or just taking first:

        const outputAmount = new Decimal(entry.resourceAmount);
        const inputAmount = new Decimal(entry.paymentResourceAmount);

        // How many purchases needed? ceil(reqAmount / outputAmount)
        const purchases = reqAmount.div(outputAmount).ceil();
        const cost = purchases.mul(inputAmount);

        // Remove requirement for current item
        // requirements[reqUid] = new Decimal(0); // Fully resolved?
        // What if we want to resolve partial?
        // Let's assume full resolution is intended for "buyable" items.
        delete requirements[reqUid];

        // Add requirement for payment item
        const oldPayReq = requirements[payUid] || new Decimal(0);
        requirements[payUid] = oldPayReq.plus(cost);

        changed = true;
        // Break to restart loop with new state (avoids modifying iterating object issues)
        break;
      }
    }
  }

  // Convert to number
  const result: Record<string, number> = {};
  for (const [uid, val] of Object.entries(requirements)) {
    if (val.gt(0)) {
      result[uid] = val.toNumber();
    }
  }

  return result;
}
