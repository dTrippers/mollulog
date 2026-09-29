import { describe, expect, it } from "@jest/globals";
import {
  buildShopCalculationInputSets,
  calculationInputsMatch,
  isUserCalculationPending,
} from "~/components/features/events/shop/hooks/useShopCalculations";
import type { ShopState } from "~/components/features/events/shop/hooks/useShopState";
import type { Stage } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

const state: ShopState = {
  itemQuantities: {},
  itemPurchaseDays: {},
  selectedBonusStudentUids: [],
  bonusStudentSelectionMode: "shared",
  selectedBonusStudentUidsByItem: {},
  includeRecruitedStudents: false,
  enabledStages: {},
  existingPaymentItemQuantities: {},
  includeFirstClear: false,
  extraStageRuns: {},
  minigameStartRound: 1,
  minigamePlayCount: 6,
  minigamePaymentQuantityMode: "expected",
  overriddenRequiredQuantities: {},
};

const stages: Stage[] = [];

describe("useShopCalculations input tracking", () => {
  it("does not treat simulation-only result updates as user calculation changes", () => {
    const inputs = {
      state,
      stages,
      shopResources: [],
      appliedBonusRatio: {},
    };
    const pendingInputs = buildShopCalculationInputSets(inputs);
    const provisionalInputs = buildShopCalculationInputSets({
      ...inputs,
      minigamePaymentCosts: [{ resourceType: ResourceTypeEnum.Currency, resourceUid: "cell", quantity: 200 }],
    });

    expect(calculationInputsMatch(pendingInputs.calculation, provisionalInputs.calculation)).toBe(false);
    expect(calculationInputsMatch(pendingInputs.user, provisionalInputs.user)).toBe(true);
    expect(isUserCalculationPending(false, true, pendingInputs.user, provisionalInputs.user)).toBe(false);
  });
});
