import type { ShopResource } from "~/domain/event-shop";

export type PaymentCost = {
  resource: ShopResource["paymentResource"];
  amount: number;
};

export function isDailyResetShopResource(shopResource: Pick<ShopResource, "purchaseTiers">) {
  return shopResource.purchaseTiers.length >= 2;
}

function clampPurchaseCount(shopResource: ShopResource, purchaseCount: number) {
  return Math.min(Math.max(0, Math.floor(purchaseCount)), shopResource.shopAmount ?? Number.POSITIVE_INFINITY);
}

function clampPurchaseDays(purchaseDays: number) {
  return Math.max(0, Math.floor(purchaseDays));
}

export function calculateEffectiveShopPurchaseCount(
  shopResource: ShopResource,
  purchaseCount: number,
  purchaseDays = 0,
) {
  const safePurchaseCount = clampPurchaseCount(shopResource, purchaseCount);
  if (!isDailyResetShopResource(shopResource)) {
    return safePurchaseCount;
  }

  return safePurchaseCount * clampPurchaseDays(purchaseDays);
}

export function calculateShopResourcePaymentCosts(
  shopResource: ShopResource,
  purchaseCount: number,
  purchaseDays = 0,
): PaymentCost[] {
  const dailyReset = isDailyResetShopResource(shopResource);
  const multiplier = dailyReset ? clampPurchaseDays(purchaseDays) : 1;
  const safePurchaseCount = Math.min(
    Math.max(0, Math.floor(purchaseCount)),
    shopResource.shopAmount ?? Number.POSITIVE_INFINITY,
  );
  if (safePurchaseCount === 0 || multiplier === 0) {
    return [];
  }

  const tiers = [...shopResource.purchaseTiers].sort((a, b) => {
    if (a.startQuantity !== b.startQuantity) {
      return a.startQuantity - b.startQuantity;
    }
    return a.tierIndex - b.tierIndex;
  });

  if (tiers.length === 0) {
    return [];
  }

  const costs = new Map<string, PaymentCost>();
  for (const tier of tiers) {
    const tierStart = Math.max(1, tier.startQuantity);
    const tierEnd = tier.quantity === null ? safePurchaseCount : tierStart + tier.quantity - 1;
    if (safePurchaseCount < tierStart) {
      continue;
    }

    const purchasesInTier = Math.max(0, Math.min(safePurchaseCount, tierEnd) - tierStart + 1);
    if (purchasesInTier === 0) {
      continue;
    }

    const resourceKey = `${tier.paymentResource.type}:${tier.paymentResource.uid}`;
    const amount = purchasesInTier * tier.unitPrice * multiplier;
    const existingCost = costs.get(resourceKey);
    if (existingCost) {
      existingCost.amount += amount;
    } else {
      costs.set(resourceKey, {
        resource: tier.paymentResource,
        amount,
      });
    }
  }

  return [...costs.values()];
}

export function calculateShopResourcePaymentCostForResource(
  shopResource: ShopResource,
  purchaseCount: number,
  paymentResourceUid: string,
  purchaseDays = 0,
) {
  return calculateShopResourcePaymentCosts(shopResource, purchaseCount, purchaseDays)
    .filter(({ resource }) => resource.uid === paymentResourceUid)
    .reduce((total, { amount }) => total + amount, 0);
}
