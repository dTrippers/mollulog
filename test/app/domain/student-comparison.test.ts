import { describe, expect, it } from "@jest/globals";
import type { StudentCalculatorCatalog, StudentCalculatorSource } from "~/domain/student-calculator";
import {
  buildStudentComparisonCalculatorState,
  calculateStudentComparisonStats,
  compareStudentStats,
  DEFAULT_STUDENT_COMPARISON_SETTINGS,
  getStudentComparisonEquipmentStatus,
  parseStudentComparisonSettings,
} from "~/domain/student-comparison";
import { StudentCatalogStat } from "~/graphql/graphql";

describe("student comparison", () => {
  it("starts at the agreed growth state and uses every catalog maximum", () => {
    const student = createStudent();
    const catalog = createCatalog();
    const state = buildStudentComparisonCalculatorState(student, catalog, DEFAULT_STUDENT_COMPARISON_SETTINGS);

    expect(state).toMatchObject({
      level: 90,
      tier: 7,
      bond: 100,
      equip1: 1,
      equip2: 2,
      equip3: 3,
      equip1Level: null,
      equip2Level: null,
      equip3Level: null,
      weaponLevel: 40,
      abilityHp: 25,
      abilityAtk: 25,
      abilityHeal: 25,
      skillEx: 5,
    });
  });

  it("preserves a real zero while leaving absent stats missing", () => {
    const stats = calculateStudentComparisonStats(
      createStudent(),
      createCatalog(),
      DEFAULT_STUDENT_COMPARISON_SETTINGS,
    );
    const values = new Map(stats.map(({ stat, value }) => [stat, value]));

    expect(values.get(StudentCatalogStat.StabilityPoint)).toBe(0);
    expect(values.has(StudentCatalogStat.AccuracyPoint)).toBe(false);
  });

  it("reports whether a selected equipment tier applies to each slot", () => {
    const settings = { ...DEFAULT_STUDENT_COMPARISON_SETTINGS, level: 1, equipmentTier: 3 };
    const statuses = getStudentComparisonEquipmentStatus(createStudent(), createCatalog(), settings, {
      hat: "모자",
      bag: "가방",
      watch: "시계",
    });

    expect(statuses.map(({ status }) => status)).toEqual(["unsupported", "locked", "locked"]);
    expect(statuses.map(({ label }) => label)).toEqual(["모자", "가방", "시계"]);
  });

  it("parses shareable settings and rejects malformed values without defaults", () => {
    expect(parseStudentComparisonSettings(new URLSearchParams(), "left")).toMatchObject({
      settings: DEFAULT_STUDENT_COMPARISON_SETTINGS,
      invalidFields: [],
    });

    const invalid = parseStudentComparisonSettings(
      new URLSearchParams("left.level=91&left.includeSkillEffects=yes"),
      "left",
    );
    expect(invalid.settings).toBeNull();
    expect(invalid.invalidFields).toEqual(["level", "includeSkillEffects"]);
  });

  it("shows the absolute difference only for the larger available value", () => {
    expect(compareStudentStats(0, 7)).toEqual({ left: 0, right: 7, largerSide: "right", difference: 7 });
    expect(compareStudentStats(12, 5)).toEqual({ left: 12, right: 5, largerSide: "left", difference: 7 });
    expect(compareStudentStats(5, 5)).toEqual({ left: 5, right: 5, largerSide: null, difference: null });
    expect(compareStudentStats(undefined, 5)).toEqual({
      left: undefined,
      right: 5,
      largerSide: null,
      difference: null,
    });
  });
});

function createStudent(): StudentCalculatorSource {
  return {
    uid: "student",
    name: "학생",
    initialTier: 3,
    attackType: "EXPLOSIVE",
    equipments: ["hat", "bag", "watch"],
    catalog: {
      statProfile: {
        growthType: "STANDARD",
        levelStats: [],
        fixedStats: [{ stat: "STABILITY_POINT", value: 0 }],
      },
      starBonuses: [],
      potentialBonuses: [],
      favorRewards: [],
      weapon: { name: "무기", description: null, imageUrl: null, growthType: "STANDARD", levelStats: [], stages: [] },
      gear: null,
      profile: {},
      terrainAdaptations: { street: "B", outdoor: "B", indoor: "B" },
      skillConfigurations: [
        {
          formIndex: 0,
          minimumWeaponStar: 0,
          minimumGearTier: 0,
          selectExSkillActionSlot: null,
          slots: [{ slot: "ex", skills: [{ position: 0, skillUid: "ex" }] }],
        },
      ],
    },
    skills: [
      {
        uid: "ex",
        skillType: "ex",
        name: "EX",
        iconUrl: null,
        maxLevel: 5,
        levels: [],
        description: null,
        additionalSkillUids: [],
        selectableSkills: [],
      },
    ],
    character: { uid: "character", studentVariants: [] },
    studentVariant: {
      uid: "variant",
      isMulticlass: false,
      primaryStudent: { uid: "student", name: "학생" },
      students: [],
    },
  } as unknown as StudentCalculatorSource;
}

function createCatalog(): StudentCalculatorCatalog {
  return {
    version: "test",
    statLevelInterpolationEndLevel: 100,
    statLevelInterpolations: Array.from({ length: 99 }, (_, index) => ({ level: index + 2, ratios: [] })),
    equipment: [
      { uid: "hat-1", category: "hat", tier: 1, maxLevel: 10, growthType: "STANDARD", name: "모자", modifiers: [] },
      { uid: "bag-1", category: "bag", tier: 1, maxLevel: 10, growthType: "STANDARD", name: "가방", modifiers: [] },
      { uid: "bag-2", category: "bag", tier: 2, maxLevel: 20, growthType: "STANDARD", name: "가방", modifiers: [] },
      { uid: "watch-1", category: "watch", tier: 1, maxLevel: 10, growthType: "STANDARD", name: "시계", modifiers: [] },
      { uid: "watch-2", category: "watch", tier: 2, maxLevel: 20, growthType: "STANDARD", name: "시계", modifiers: [] },
      { uid: "watch-3", category: "watch", tier: 3, maxLevel: 30, growthType: "STANDARD", name: "시계", modifiers: [] },
    ],
  } as unknown as StudentCalculatorCatalog;
}
