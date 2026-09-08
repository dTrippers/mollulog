export type SkillConfigurationThresholds = {
  formIndex: number;
  minimumWeaponStar: number;
  minimumGearTier: number;
};

export function selectUniqueMaximalSkillConfiguration<T extends SkillConfigurationThresholds>(
  configurations: readonly T[],
  formIndex: number,
  weaponStar: number,
  gearTier: number,
): T | undefined {
  const candidates = configurations.filter(
    (configuration) =>
      configuration.formIndex === formIndex &&
      configuration.minimumWeaponStar <= weaponStar &&
      configuration.minimumGearTier <= gearTier,
  );
  const maximal = candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) =>
          other !== candidate &&
          other.minimumWeaponStar >= candidate.minimumWeaponStar &&
          other.minimumGearTier >= candidate.minimumGearTier &&
          (other.minimumWeaponStar > candidate.minimumWeaponStar || other.minimumGearTier > candidate.minimumGearTier),
      ),
  );
  return maximal.length === 1 ? maximal[0] : undefined;
}
