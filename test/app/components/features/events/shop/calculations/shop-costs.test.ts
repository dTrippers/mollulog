import { describe, expect, it } from "@jest/globals";
import {
  calculateEffectiveShopPurchaseCount,
  calculateShopResourcePaymentCosts,
  isDailyResetShopResource,
} from "../../../../../../../app/components/features/events/shop/calculations/shop-costs";
import type { ShopResource } from "../../../../../../../app/domain/event-shop";
import { ResourceTypeEnum } from "../../../../../../../app/graphql/graphql";

const pyroxene = {
  type: ResourceTypeEnum.Currency,
  uid: "4",
  name: "청휘석",
};

const ticketShopResource: ShopResource = {
  uid: "8540000",
  resource: {
    type: ResourceTypeEnum.Currency,
    uid: "19",
    name: "연합 작전 티켓",
    rarity: 1,
  },
  resourceAmount: 1,
  paymentResource: pyroxene,
  purchaseTiers: [
    { tierIndex: 0, startQuantity: 1, quantity: 10, unitPrice: 5, paymentResource: pyroxene },
    { tierIndex: 1, startQuantity: 11, quantity: 10, unitPrice: 10, paymentResource: pyroxene },
    { tierIndex: 2, startQuantity: 21, quantity: 10, unitPrice: 15, paymentResource: pyroxene },
  ],
  shopAmount: 30,
};

describe("calculateShopResourcePaymentCosts", () => {
  it("splits purchase counts across price tiers", () => {
    expect(calculateShopResourcePaymentCosts(ticketShopResource, 25, 1)).toEqual([
      {
        resource: pyroxene,
        amount: 225,
      },
    ]);
  });

  it("uses a single tier for ordinary fixed-price shop items", () => {
    expect(
      calculateShopResourcePaymentCosts(
        {
          ...ticketShopResource,
          purchaseTiers: [{ tierIndex: 0, startQuantity: 1, quantity: 10, unitPrice: 50, paymentResource: pyroxene }],
        },
        7,
      ),
    ).toEqual([
      {
        resource: pyroxene,
        amount: 350,
      },
    ]);
  });

  it("clamps purchase counts to the shop limit", () => {
    expect(calculateShopResourcePaymentCosts(ticketShopResource, 35, 1)).toEqual([
      {
        resource: pyroxene,
        amount: 300,
      },
    ]);
  });

  it("treats multiple purchase tiers as a daily reset price table", () => {
    expect(isDailyResetShopResource(ticketShopResource)).toBe(true);
    expect(calculateShopResourcePaymentCosts(ticketShopResource, 25, 14)).toEqual([
      {
        resource: pyroxene,
        amount: 3150,
      },
    ]);
    expect(calculateEffectiveShopPurchaseCount(ticketShopResource, 25, 14)).toBe(350);
  });
});
