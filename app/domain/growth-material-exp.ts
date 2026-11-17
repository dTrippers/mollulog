// Equipment and unique-weapon growth measured in EXP.
//
// BAQL does not expose these tables yet, so the values are taken from the JP and Global
// community tables (wikiru, Fandom, Game8), which agree with each other.

/** EXP needed to level a piece of equipment from Lv1 to its tier's max level. */
export const EQUIPMENT_TIER_TOTAL_EXP: Record<number, number> = {
  1: 381,
  2: 1841,
  3: 5456,
  4: 12326,
  5: 17326,
  6: 23551,
  7: 31141,
  8: 40231,
  9: 50961,
  10: 63466,
};

/** EXP given by each enhancement stone, keyed by its equipment UID. */
export const EQUIPMENT_EXP_STONES: readonly { uid: string; exp: number }[] = [
  { uid: "1", exp: 90 },
  { uid: "2", exp: 360 },
  { uid: "3", exp: 1440 },
  { uid: "4", exp: 5760 },
];

/** Cumulative EXP from unique-weapon Lv1 to each level. */
const WEAPON_TOTAL_EXP_BY_LEVEL: readonly number[] = [
  0, 0, 25, 55, 90, 130, 175, 225, 280, 340, 405, 475, 555, 645, 745, 855, 975, 1105, 1245, 1395, 1555, 1725, 1915,
  2125, 2355, 2605, 2875, 3185, 3535, 3925, 4355, 4825, 5355, 5945, 6595, 7305, 8075, 8905, 9795, 10745, 11755, 12825,
  13980, 15220, 16545, 17955, 19450, 21030, 22695, 24445, 26280, 28200, 30205, 32295, 34470, 36730, 39075, 41535, 44110,
  46800, 49605,
];

export type WeaponExpFamily = "a" | "b" | "c" | "z";
/** The material family that gives a weapon bonus EXP. `none` when the weapon type has no family. */
export type WeaponExpBonusFamily = "a" | "b" | "c" | "none";

const WEAPON_EXP_MATERIAL_FAMILY_BY_UID_PREFIX: Record<number, WeaponExpFamily> = { 1: "a", 2: "b", 3: "c", 4: "z" };
const WEAPON_EXP_MATERIAL_BASE_EXP_BY_RARITY: Record<number, number> = { 0: 10, 1: 50, 2: 200, 3: 1000 };
const WEAPON_EXP_BONUS_RATE = 1.5;

const WEAPON_EXP_BONUS_FAMILY_BY_WEAPON_TYPE: Record<string, WeaponExpBonusFamily> = {
  smg: "a",
  sg: "a",
  hg: "a",
  ft: "a",
  ar: "b",
  gl: "b",
  rl: "b",
  mg: "c",
  sr: "c",
  mt: "c",
  rg: "c",
};

export const WEAPON_EXP_BONUS_FAMILIES: readonly WeaponExpBonusFamily[] = ["a", "b", "c", "none"];

export type WeaponExpByBonusFamily = Record<WeaponExpBonusFamily, number>;

export function emptyWeaponExpByBonusFamily(): WeaponExpByBonusFamily {
  return { a: 0, b: 0, c: 0, none: 0 };
}

export function getWeaponExpBonusFamily(weaponType: string | null | undefined): WeaponExpBonusFamily {
  return (weaponType && WEAPON_EXP_BONUS_FAMILY_BY_WEAPON_TYPE[weaponType]) || "none";
}

export function getEquipmentExpStoneExp(uid: string): number | null {
  return EQUIPMENT_EXP_STONES.find((stone) => stone.uid === uid)?.exp ?? null;
}

/** Returns the family and base EXP of a unique-weapon growth material (equipment UIDs 10-13, 20-23, 30-33, 40-43). */
export function getWeaponExpMaterial(uid: string): { family: WeaponExpFamily; exp: number } | null {
  const numericUid = Number(uid);
  if (!Number.isInteger(numericUid)) {
    return null;
  }

  const family = WEAPON_EXP_MATERIAL_FAMILY_BY_UID_PREFIX[Math.floor(numericUid / 10)];
  const exp = WEAPON_EXP_MATERIAL_BASE_EXP_BY_RARITY[numericUid % 10];
  return family && exp ? { family, exp } : null;
}

/**
 * EXP needed to raise one piece of equipment from `currentTier` to `targetTier`.
 *
 * Each tier is assumed to be leveled to its max: the current tier is already full, and every
 * new tier up to the target starts at Lv1 and is leveled to its max.
 */
export function calculateEquipmentTierUpExp(currentTier: number | null, targetTier: number | null): number {
  if (currentTier == null || targetTier == null || targetTier <= currentTier) {
    return 0;
  }

  let total = 0;
  for (let tier = currentTier + 1; tier <= targetTier; tier++) {
    total += EQUIPMENT_TIER_TOTAL_EXP[tier] ?? 0;
  }
  return total;
}

/** EXP needed to raise a unique weapon from `currentLevel` to `targetLevel`. Level 0 means not unlocked yet. */
export function calculateWeaponLevelUpExp(
  currentLevel: number | null | undefined,
  targetLevel: number | null | undefined,
): number {
  if (targetLevel == null || targetLevel <= (currentLevel ?? 0)) {
    return 0;
  }

  const currentTotal = WEAPON_TOTAL_EXP_BY_LEVEL[Math.max(0, currentLevel ?? 0)];
  const targetTotal = WEAPON_TOTAL_EXP_BY_LEVEL[targetLevel];
  if (currentTotal == null || targetTotal == null) {
    return 0;
  }
  return Math.max(0, targetTotal - currentTotal);
}

export type WeaponExpAllocation = {
  requiredExp: number;
  /** Required EXP the owned materials cover, with bonus EXP applied where it is used. */
  coveredExp: number;
  /** Base EXP of the materials left after covering every requirement. */
  surplusExp: number;
  shortageExp: number;
  /** Owned EXP in the same terms as `requiredExp`: covered EXP plus the left-over base EXP. */
  ownedExp: number;
};

/**
 * Allocates owned weapon materials to the required EXP of each bonus family.
 *
 * Each family first uses its own materials at the bonus rate, then the universal family (`z`)
 * at the bonus rate, then left-over materials of the other families at the base rate.
 */
export function allocateWeaponExpMaterials(
  requiredExpByFamily: WeaponExpByBonusFamily,
  ownedBaseExpByFamily: Record<WeaponExpFamily, number>,
): WeaponExpAllocation {
  const remainingNeed = { ...requiredExpByFamily };
  const remainingSupply = { ...ownedBaseExpByFamily };
  let coveredExp = 0;

  const cover = (need: WeaponExpBonusFamily, supply: WeaponExpFamily, rate: number) => {
    const used = Math.min(remainingNeed[need], remainingSupply[supply] * rate);
    if (used <= 0) {
      return;
    }
    remainingNeed[need] -= used;
    remainingSupply[supply] -= used / rate;
    coveredExp += used;
  };

  for (const family of ["a", "b", "c"] as const) {
    cover(family, family, WEAPON_EXP_BONUS_RATE);
  }
  for (const family of WEAPON_EXP_BONUS_FAMILIES) {
    cover(family, "z", WEAPON_EXP_BONUS_RATE);
  }
  for (const need of WEAPON_EXP_BONUS_FAMILIES) {
    for (const supply of ["a", "b", "c"] as const) {
      cover(need, supply, 1);
    }
  }

  const requiredExp = WEAPON_EXP_BONUS_FAMILIES.reduce((sum, family) => sum + requiredExpByFamily[family], 0);
  // A small epsilon absorbs float error from dividing by the bonus rate.
  const roundedCoveredExp = Math.min(requiredExp, Math.floor(coveredExp + 1e-6));
  const surplusExp = Math.floor(remainingSupply.a + remainingSupply.b + remainingSupply.c + remainingSupply.z + 1e-6);
  return {
    requiredExp,
    coveredExp: roundedCoveredExp,
    surplusExp,
    shortageExp: requiredExp - roundedCoveredExp,
    ownedExp: roundedCoveredExp + surplusExp,
  };
}
