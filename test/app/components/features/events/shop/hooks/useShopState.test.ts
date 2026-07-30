import { describe, expect, it } from "@jest/globals";
import { getInitialItemPurchaseDays } from "../../../../../../../app/components/features/events/shop/hooks/useShopState";
import type { ShopResource } from "../../../../../../../app/domain/event-shop";
import { ResourceTypeEnum } from "../../../../../../../app/graphql/graphql";
import type { EventShopState } from "../../../../../../../app/models/event-shop-state";

const pyroxene = {
  type: ResourceTypeEnum.Currency,
  uid: "4",
  name: "청휘석",
};

function createShopResource(overrides: Partial<ShopResource> = {}): ShopResource {
  return {
    uid: "daily-ticket",
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
    ],
    shopAmount: 60,
    ...overrides,
  };
}

function createSavedShopState(overrides: Partial<EventShopState> = {}): EventShopState {
  return {
    itemQuantities: {},
    itemPurchaseDays: {},
    selectedBonusStudentUids: [],
    bonusStudentSelectionMode: "shared",
    selectedBonusStudentUidsByItem: {},
    enabledStages: {},
    includeRecruitedStudents: true,
    existingPaymentItemQuantities: {},
    includeFirstClear: false,
    extraStageRuns: {},
    minigamePlayCount: 0,
    minigamePaymentQuantityMode: "expected",
    overriddenRequiredQuantities: {},
    ...overrides,
  };
}

describe("getInitialItemPurchaseDays", () => {
  it("defaults old saved daily-reset purchases to one day", () => {
    expect(
      getInitialItemPurchaseDays(
        createSavedShopState({
          itemQuantities: { "daily-ticket": 60 },
          itemPurchaseDays: {},
        }),
        [createShopResource()],
      ),
    ).toEqual({ "daily-ticket": 1 });
  });

  it("preserves saved purchase days", () => {
    expect(
      getInitialItemPurchaseDays(
        createSavedShopState({
          itemQuantities: { "daily-ticket": 60 },
          itemPurchaseDays: { "daily-ticket": 7 },
        }),
        [createShopResource()],
      ),
    ).toEqual({ "daily-ticket": 7 });
  });

  it("does not default unpurchased or ordinary shop resources", () => {
    expect(
      getInitialItemPurchaseDays(
        createSavedShopState({
          itemQuantities: { "daily-ticket": 0, "ordinary-item": 10 },
        }),
        [
          createShopResource(),
          createShopResource({
            uid: "ordinary-item",
            purchaseTiers: [{ tierIndex: 0, startQuantity: 1, quantity: 10, unitPrice: 10, paymentResource: pyroxene }],
          }),
        ],
      ),
    ).toEqual({});
  });
});
