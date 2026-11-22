import { describe, expect, it } from "@jest/globals";
import {
  allocateWeaponExpMaterials,
  calculateEquipmentTierUpExp,
  calculateWeaponLevelUpExp,
  EQUIPMENT_TIER_TOTAL_EXP,
  getWeaponExpBonusFamily,
  getWeaponExpMaterial,
} from "../../../app/domain/growth-material-exp";

describe("equipment tier-up EXP", () => {
  it("sums the full Lv1-to-max EXP of every new tier and treats the current tier as already maxed", () => {
    expect(calculateEquipmentTierUpExp(7, 8)).toBe(40231);
    expect(calculateEquipmentTierUpExp(1, 10)).toBe(246680 - 381);
    expect(Object.values(EQUIPMENT_TIER_TOTAL_EXP).reduce((sum, exp) => sum + exp, 0)).toBe(246680);
  });

  it("needs no EXP when the target is not above the current tier", () => {
    expect(calculateEquipmentTierUpExp(8, 8)).toBe(0);
    expect(calculateEquipmentTierUpExp(8, 7)).toBe(0);
    expect(calculateEquipmentTierUpExp(null, 8)).toBe(0);
  });
});

describe("unique-weapon level-up EXP", () => {
  it("uses the cumulative EXP table at each star cap", () => {
    expect(calculateWeaponLevelUpExp(1, 30)).toBe(4355);
    expect(calculateWeaponLevelUpExp(1, 40)).toBe(11755);
    expect(calculateWeaponLevelUpExp(1, 50)).toBe(26280);
    expect(calculateWeaponLevelUpExp(1, 60)).toBe(49605);
    expect(calculateWeaponLevelUpExp(40, 50)).toBe(26280 - 11755);
  });

  it("treats a locked weapon (level 0 or unset) as Lv1", () => {
    expect(calculateWeaponLevelUpExp(0, 30)).toBe(4355);
    expect(calculateWeaponLevelUpExp(null, 30)).toBe(4355);
    expect(calculateWeaponLevelUpExp(30, 30)).toBe(0);
  });
});

describe("unique-weapon materials", () => {
  it("maps material UIDs to their family and base EXP", () => {
    expect(getWeaponExpMaterial("10")).toEqual({ family: "a", exp: 10 });
    expect(getWeaponExpMaterial("23")).toEqual({ family: "b", exp: 1000 });
    expect(getWeaponExpMaterial("32")).toEqual({ family: "c", exp: 200 });
    expect(getWeaponExpMaterial("41")).toEqual({ family: "z", exp: 50 });
    expect(getWeaponExpMaterial("4")).toBeNull();
    expect(getWeaponExpMaterial("14")).toBeNull();
  });

  it("maps weapon types to their bonus family", () => {
    expect(getWeaponExpBonusFamily("ft")).toBe("a");
    expect(getWeaponExpBonusFamily("rl")).toBe("b");
    expect(getWeaponExpBonusFamily("mt")).toBe("c");
    expect(getWeaponExpBonusFamily("taser")).toBe("none");
    expect(getWeaponExpBonusFamily(null)).toBe("none");
  });

  it("uses the matching family at the bonus rate first", () => {
    const allocation = allocateWeaponExpMaterials({ a: 1500, b: 0, c: 0, none: 0 }, { a: 1000, b: 0, c: 0, z: 0 });
    expect(allocation).toEqual({ requiredExp: 1500, coveredExp: 1500, surplusExp: 0, shortageExp: 0, ownedExp: 1500 });
  });

  it("uses the universal family at the bonus rate before other families", () => {
    const allocation = allocateWeaponExpMaterials(
      { a: 3000, b: 0, c: 0, none: 0 },
      { a: 1000, b: 1000, c: 0, z: 1000 },
    );
    // a: 1000 x 1.5 = 1500, z: 1000 x 1.5 = 1500, and b stays unused.
    expect(allocation).toEqual({
      requiredExp: 3000,
      coveredExp: 3000,
      surplusExp: 1000,
      shortageExp: 0,
      ownedExp: 4000,
    });
  });

  it("uses other families at the base rate and reports the remaining shortage", () => {
    const allocation = allocateWeaponExpMaterials({ a: 3000, b: 0, c: 0, none: 0 }, { a: 1000, b: 1000, c: 0, z: 0 });
    expect(allocation).toEqual({
      requiredExp: 3000,
      coveredExp: 2500,
      surplusExp: 0,
      shortageExp: 500,
      ownedExp: 2500,
    });
  });

  it("keeps each family's materials for its own weapons before sharing them", () => {
    const allocation = allocateWeaponExpMaterials(
      { a: 1500, b: 1500, c: 0, none: 0 },
      { a: 1000, b: 1000, c: 0, z: 0 },
    );
    expect(allocation.shortageExp).toBe(0);
    expect(allocation.surplusExp).toBe(0);
  });

  it("gives a weapon without a bonus family the bonus only from the universal family", () => {
    const allocation = allocateWeaponExpMaterials({ a: 0, b: 0, c: 0, none: 2000 }, { a: 500, b: 0, c: 0, z: 1000 });
    expect(allocation).toEqual({ requiredExp: 2000, coveredExp: 2000, surplusExp: 0, shortageExp: 0, ownedExp: 2000 });
  });

  it("does not report a 1 EXP shortage from rounding a partly used material", () => {
    const allocation = allocateWeaponExpMaterials({ a: 100, b: 0, c: 0, none: 0 }, { a: 10, b: 0, c: 0, z: 100 });
    expect(allocation.shortageExp).toBe(0);
    expect(allocation.coveredExp).toBe(100);
  });

  it("reports owned materials as base EXP when nothing is required", () => {
    const allocation = allocateWeaponExpMaterials({ a: 0, b: 0, c: 0, none: 0 }, { a: 10, b: 50, c: 200, z: 1000 });
    expect(allocation).toEqual({ requiredExp: 0, coveredExp: 0, surplusExp: 1260, shortageExp: 0, ownedExp: 1260 });
  });
});
