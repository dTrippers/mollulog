import { describe, expect, it } from "@jest/globals";
import { allocateEquipmentBlueprints, getUniversalBlueprintCost } from "~/domain/equipment-blueprint-allocation";
import {
  EQUIPMENT_BLUEPRINT_CHOICE_BOX_UID_BY_TIER,
  EQUIPMENT_TYPE_ORDER,
  getUniversalEquipmentBlueprintUid,
} from "~/domain/growth-resource";

describe("equipment blueprint allocation", () => {
  it("uses the approved universal blueprint costs for every tier", () => {
    expect(Array.from({ length: 10 }, (_, index) => getUniversalBlueprintCost(index + 1))).toEqual([
      1, 2, 3, 5, 7, 10, 15, 20, 30, 50,
    ]);
  });

  it("applies same-tier choice boxes before same-category universal blueprints", () => {
    const allocation = allocateEquipmentBlueprints({
      directDemands: [
        { uid: "101004", requiredAmount: 1, ownedAmount: 0 },
        { uid: "102004", requiredAmount: 1, ownedAmount: 0 },
      ],
      choiceBoxes: [{ uid: "150031", ownedAmount: 1 }],
      universalBlueprints: [{ uid: "501000", ownedAmount: 7 }],
    });

    expect(allocation.demands).toEqual([
      expect.objectContaining({
        uid: "101004",
        typeKey: "hat",
        tier: 5,
        directDeficit: 1,
        choiceBoxAmount: 1,
        universalBlueprintAmount: 0,
        universalBlueprintCost: 0,
        finalDeficit: 0,
      }),
      expect.objectContaining({
        uid: "102004",
        typeKey: "gloves",
        tier: 5,
        directDeficit: 1,
        choiceBoxAmount: 0,
        universalBlueprintAmount: 0,
        finalDeficit: 1,
      }),
    ]);
    expect(allocation.choiceBoxes).toEqual([
      expect.objectContaining({ uid: "150031", requiredAmount: 2, usedAmount: 1, remainingAmount: -1 }),
    ]);
    expect(allocation.universalBlueprints).toEqual([
      expect.objectContaining({
        uid: "501000",
        requiredAmount: 0,
        usedAmount: 0,
        remainingAmount: 7,
      }),
    ]);
    expect(allocation.totalFinalDeficit).toBe(1);
  });

  it("does not spend a universal blueprint on another equipment category", () => {
    const allocation = allocateEquipmentBlueprints({
      directDemands: [
        { uid: "101004", requiredAmount: 2, ownedAmount: 0 },
        { uid: "102004", requiredAmount: 1, ownedAmount: 0 },
      ],
      choiceBoxes: [{ uid: "150031", ownedAmount: 1 }],
      universalBlueprints: [{ uid: "501000", ownedAmount: 7 }],
    });

    expect(allocation.demands).toEqual([
      expect.objectContaining({ uid: "101004", universalBlueprintAmount: 1, choiceBoxAmount: 1, finalDeficit: 0 }),
      expect.objectContaining({ uid: "102004", universalBlueprintAmount: 0, choiceBoxAmount: 0, finalDeficit: 1 }),
    ]);
    expect(allocation.universalBlueprints[0]).toEqual(
      expect.objectContaining({ requiredAmount: 7, usedAmount: 7, remainingAmount: 0 }),
    );
    expect(allocation.totalFinalDeficit).toBe(1);
  });

  it("prefers lower-tier shortages when substitute coverage is tied", () => {
    const allocation = allocateEquipmentBlueprints({
      directDemands: [
        { uid: "101000", requiredAmount: 1, ownedAmount: 0 },
        { uid: "101004", requiredAmount: 1, ownedAmount: 0 },
      ],
      choiceBoxes: [],
      universalBlueprints: [{ uid: "501000", ownedAmount: 7 }],
    });

    expect(allocation.demands).toEqual([
      expect.objectContaining({ uid: "101000", tier: 1, universalBlueprintAmount: 1, finalDeficit: 0 }),
      expect.objectContaining({ uid: "101004", tier: 5, universalBlueprintAmount: 0, finalDeficit: 1 }),
    ]);
  });

  it("caps universal and choice-box consumption at integer inventory quantities", () => {
    const allocation = allocateEquipmentBlueprints({
      directDemands: [{ uid: "101004", requiredAmount: 2, ownedAmount: 1 }],
      choiceBoxes: [{ uid: "150031", ownedAmount: 0 }],
      universalBlueprints: [{ uid: "501000", ownedAmount: 7 }],
    });

    expect(allocation.demands[0]).toEqual(
      expect.objectContaining({ directDeficit: 1, universalBlueprintAmount: 1, finalDeficit: 0 }),
    );
    expect(allocation.choiceBoxes[0]).toEqual(
      expect.objectContaining({ requiredAmount: 0, usedAmount: 0, remainingAmount: 0 }),
    );
    expect(allocation.universalBlueprints[0]).toEqual(
      expect.objectContaining({ requiredAmount: 7, usedAmount: 7, remainingAmount: 0 }),
    );

    const insufficient = allocateEquipmentBlueprints({
      directDemands: [{ uid: "101004", requiredAmount: 3, ownedAmount: 0 }],
      choiceBoxes: [],
      universalBlueprints: [{ uid: "501000", ownedAmount: 7 }],
    });
    expect(insufficient.demands[0]).toEqual(
      expect.objectContaining({ universalBlueprintAmount: 1, universalBlueprintCost: 7, finalDeficit: 2 }),
    );
    expect(insufficient.universalBlueprints[0]).toEqual(
      expect.objectContaining({ requiredAmount: 21, usedAmount: 7, remainingAmount: -14 }),
    );
  });

  it("rejects fractional inventory and demand quantities", () => {
    expect(() =>
      allocateEquipmentBlueprints({
        directDemands: [{ uid: "101004", requiredAmount: 1.5, ownedAmount: 0 }],
        choiceBoxes: [],
        universalBlueprints: [],
      }),
    ).toThrow("0 이상의 정수여야 해요");
    expect(() =>
      allocateEquipmentBlueprints({
        directDemands: [{ uid: "101004", requiredAmount: 1, ownedAmount: 0 }],
        choiceBoxes: [],
        universalBlueprints: [{ uid: "501000", ownedAmount: 7.5 }],
      }),
    ).toThrow("0 이상의 정수여야 해요");
  });

  it("solves the full nine-category, ten-tier shape within a bounded time", () => {
    const directDemands = EQUIPMENT_TYPE_ORDER.flatMap((_, typeIndex) =>
      Array.from({ length: 10 }, (_, tierIndex) => ({
        uid: String(100999 + typeIndex * 1000 + tierIndex + 1),
        requiredAmount: 4 + ((typeIndex + tierIndex) % 3),
        ownedAmount: typeIndex % 2 === 0 ? 1 : 0,
      })),
    );
    const choiceBoxes = Object.entries(EQUIPMENT_BLUEPRINT_CHOICE_BOX_UID_BY_TIER).map(([tier, uid]) => ({
      uid,
      ownedAmount: Number(tier) % 2 === 0 ? 4 : 2,
    }));
    const universalBlueprints = EQUIPMENT_TYPE_ORDER.map((typeKey) => ({
      uid: getUniversalEquipmentBlueprintUid(typeKey) as string,
      ownedAmount: 120,
    }));

    const startedAt = Date.now();
    const allocation = allocateEquipmentBlueprints({ directDemands, choiceBoxes, universalBlueprints });
    const repeatedAllocation = allocateEquipmentBlueprints({ directDemands, choiceBoxes, universalBlueprints });
    const elapsedMs = Date.now() - startedAt;

    expect(allocation.demands).toHaveLength(90);
    expect(allocation.demands.every((demand) => demand.finalDeficit >= 0)).toBe(true);
    expect(repeatedAllocation).toEqual(allocation);
    expect(elapsedMs).toBeLessThan(2_000);
  }, 5_000);
});
