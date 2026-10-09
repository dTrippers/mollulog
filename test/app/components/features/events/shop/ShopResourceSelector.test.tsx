import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { ShopResourceSelector } from "~/components/features/events/shop/ShopResourceSelector";
import type { ShopResource } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { ShopActions, ShopState } from "~/components/features/events/shop/hooks";

const paymentResource = {
  type: ResourceTypeEnum.Currency,
  uid: "currency-1",
  name: "크레딧",
};

const shopResource: ShopResource = {
  uid: "shop-item-1",
  resource: { type: ResourceTypeEnum.Item, uid: "3001", name: "아이템", rarity: 1 },
  resourceAmount: 1,
  paymentResource,
  purchaseTiers: [
    { tierIndex: 1, startQuantity: 0, quantity: 1, unitPrice: 1200, paymentResource },
    { tierIndex: 2, startQuantity: 1, quantity: 1, unitPrice: 1500, paymentResource },
  ],
  shopAmount: 20,
};

function renderShopResourceSelector(ownedQuantities: Record<string, number> | null) {
  return renderToStaticMarkup(
    <ShopResourceSelector
      shopResources={[shopResource]}
      ownedQuantities={ownedQuantities}
      collectableResources={[{ ...paymentResource, forPayment: true }]}
      eventUid="event-1"
      state={{ itemQuantities: {}, itemPurchaseDays: {} } as ShopState}
      actions={{} as ShopActions}
      availablePurchaseDays={7}
    />,
  );
}

function textContent(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

describe("ShopResourceSelector owned quantities", () => {
  it("shows grouped quantities and wraps the unit-price range in the left-aligned info stack", () => {
    const markup = renderShopResourceSelector({ "shop-item-1": 1234 });

    expect(textContent(markup)).toContain("보유 1,234");
    expect(markup).toMatch(/1,200~<wbr\s*\/?\s*>1,500/);
    expect(markup).toContain("flex items-start gap-2");
    expect(markup).toContain("flex min-w-0 grow flex-col gap-0.5");
    expect(textContent(markup)).toContain("20회 구매 가능");
  });

  it("shows a registered zero with the same owned-quantity label", () => {
    const markup = renderShopResourceSelector({ "shop-item-1": 0 });

    expect(textContent(markup)).toContain("보유 0");
  });

  it.each([null, {}])("omits the owned line when data is %s", (ownedQuantities) => {
    const markup = renderShopResourceSelector(ownedQuantities);

    expect(markup).not.toContain("보유");
  });
});
