import { describe, expect, it } from "@jest/globals";
import { selectUniqueMaximalSkillConfiguration } from "~/domain/student-skill-configuration";

type TestConfiguration = {
  id: string;
  formIndex: number;
  minimumWeaponStar: number;
  minimumGearTier: number;
};

describe("selectUniqueMaximalSkillConfiguration", () => {
  it("returns the unique component-wise maximal configuration", () => {
    const configurations: TestConfiguration[] = [
      { id: "base", formIndex: 0, minimumWeaponStar: 0, minimumGearTier: 0 },
      { id: "upgrade", formIndex: 0, minimumWeaponStar: 1, minimumGearTier: 1 },
    ];

    expect(selectUniqueMaximalSkillConfiguration(configurations, 0, 1, 1)?.id).toBe("upgrade");
  });

  it("returns undefined when no configuration matches the requested thresholds", () => {
    const configurations: TestConfiguration[] = [
      { id: "other-form", formIndex: 1, minimumWeaponStar: 0, minimumGearTier: 0 },
    ];

    expect(selectUniqueMaximalSkillConfiguration(configurations, 0, 1, 1)).toBeUndefined();
  });

  it("returns undefined when multiple incomparable configurations are maximal", () => {
    const configurations: TestConfiguration[] = [
      { id: "weapon-upgrade", formIndex: 0, minimumWeaponStar: 1, minimumGearTier: 0 },
      { id: "gear-upgrade", formIndex: 0, minimumWeaponStar: 0, minimumGearTier: 1 },
    ];

    expect(selectUniqueMaximalSkillConfiguration(configurations, 0, 1, 1)).toBeUndefined();
  });
});
