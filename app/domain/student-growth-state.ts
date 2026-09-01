export const ABILITY_RELEASE_MAX_LEVEL = 25;
export const EQUIPMENT_LEVEL_MAX_LEVEL = 70;
export const WEAPON_LEVEL_MAX_LEVEL = 60;

export const ABILITY_RELEASE_WB_UIDS = {
  abilityHp: "2000",
  abilityAtk: "2001",
  abilityHeal: "2002",
} as const;

export const TARGET_ABILITY_RELEASE_WB_UIDS = {
  targetAbilityHp: ABILITY_RELEASE_WB_UIDS.abilityHp,
  targetAbilityAtk: ABILITY_RELEASE_WB_UIDS.abilityAtk,
  targetAbilityHeal: ABILITY_RELEASE_WB_UIDS.abilityHeal,
} as const;

export type AbilityReleaseCurrentField = keyof typeof ABILITY_RELEASE_WB_UIDS;
export type AbilityReleaseTargetField = keyof typeof TARGET_ABILITY_RELEASE_WB_UIDS;

export type AbilityReleaseCostBand = {
  minLevel: number;
  maxLevel: number;
  artifactRarity: number;
  artifactAmount: number;
  wbAmount: number;
  credit: number;
};

export const ABILITY_RELEASE_COST_BANDS: readonly AbilityReleaseCostBand[] = [
  { minLevel: 1, maxLevel: 5, artifactRarity: 1, artifactAmount: 10, wbAmount: 2, credit: 100_000 },
  { minLevel: 6, maxLevel: 10, artifactRarity: 1, artifactAmount: 15, wbAmount: 2, credit: 100_000 },
  { minLevel: 11, maxLevel: 15, artifactRarity: 1, artifactAmount: 20, wbAmount: 2, credit: 100_000 },
  { minLevel: 16, maxLevel: 20, artifactRarity: 2, artifactAmount: 6, wbAmount: 4, credit: 200_000 },
  { minLevel: 21, maxLevel: 25, artifactRarity: 2, artifactAmount: 8, wbAmount: 4, credit: 200_000 },
] as const;

export function getWeaponLevelMaxByTier(tier: number | null | undefined): number {
  if (tier == null || tier <= 5) {
    return 0;
  }

  if (tier >= 9) {
    return 60;
  }

  return 20 + (tier - 5) * 10;
}

export function assertWeaponLevelRange(
  weaponLevel: number | null | undefined,
  tier: number | null | undefined,
  label: string,
) {
  if (weaponLevel == null) {
    return;
  }

  const max = getWeaponLevelMaxByTier(tier);
  if (weaponLevel < 0 || weaponLevel > max) {
    throw new Error(`${label}은(는) 현재 성급 기준 0부터 ${max} 사이만 입력할 수 있어요`);
  }
}

export function assertAbilityReleaseAvailable(
  values: readonly (number | null | undefined)[],
  tier: number | null | undefined,
  label: string,
) {
  if ((tier ?? 0) > 5 || values.every((value) => value == null || value <= 0)) {
    return;
  }

  throw new Error(`${label}은(는) 고유무기 장착 후 입력할 수 있어요`);
}
