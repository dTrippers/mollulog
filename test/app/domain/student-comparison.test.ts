import { describe, expect, it } from "@jest/globals";
import type { StudentCalculatorCatalog, StudentCalculatorSource } from "~/domain/student-calculator";
import {
  calculateStudentComparisonStats,
  compareStudentStats,
  DEFAULT_STUDENT_COMPARISON_SETTINGS,
  getDefaultStudentComparisonSettings,
  getStudentComparisonSettingsAfterTierChange,
  getStudentComparisonSettingsErrors,
  getStudentComparisonTerrainAdaptations,
  parseStudentComparisonSettings,
  resolveImportedStudentComparisonSettings,
  STUDENT_COMPARISON_STATS,
  stripLegacyStudentComparisonSkillEffectParams,
} from "~/domain/student-comparison";
import {
  StudentCatalogStat,
  StudentCatalogStatGrowthType,
  StudentCatalogStatModifierKind,
  StudentSkillModifierActivation,
  StudentSkillModifierPersistence,
} from "~/graphql/graphql";

describe("student comparison", () => {
  it("starts at the agreed growth state and uses every catalog maximum", () => {
    const student = createStudent();
    const catalog = createCatalog();
    const defaults = getDefaultStudentComparisonSettings(student, catalog);

    expect(defaults).toMatchObject({
      level: 90,
      tier: 7,
      bond: 100,
      equip1: 1,
      equip2: 2,
      equip3: 3,
      equip1Level: 10,
      equip2Level: 20,
      equip3Level: 30,
      weaponLevel: 40,
      abilityHp: 25,
      abilityAtk: 25,
      abilityHeal: 25,
      skillEx: 5,
    });
    expect(defaults).toMatchObject({ skillNormal: null, skillEnhanced: null, skillSub: null });
    expect(defaults).not.toHaveProperty("includeSkillEffects");
    expect(STUDENT_COMPARISON_STATS.reduce((count, group) => count + group.stats.length, 0)).toBe(22);
  });

  it("uses each independently encoded growth field and keeps malformed fields invalid", () => {
    const defaults = getDefaultStudentComparisonSettings(createStudent(), createCatalog());
    const parsed = parseStudentComparisonSettings(
      new URLSearchParams(
        "left.level=81&left.skillEx=4&left.equip2=1&left.equip2Level=10&left.includeSkillEffects=false",
      ),
      "left",
      defaults,
    );

    expect(parsed.settings).toMatchObject({
      level: 81,
      skillEx: 4,
      equip1: 1,
      equip2: 1,
      equip2Level: 10,
      equip3: 3,
    });
    expect(parsed.invalidFields).toEqual([]);

    const invalid = parseStudentComparisonSettings(
      new URLSearchParams("left.level=91&left.equip2Level=abc"),
      "left",
      defaults,
    );
    expect(invalid.settings).toBeNull();
    expect(invalid.invalidFields).toEqual(["level", "equip2Level"]);
  });

  it("rejects syntactically valid equipment tiers absent from the student's catalog", () => {
    const student = createStudent();
    const catalog = createCatalog();
    const parsed = parseStudentComparisonSettings(new URLSearchParams("left.equip1=9"), "left");

    expect(parsed.invalidFields).toEqual([]);
    const settings = parsed.settings;
    if (settings === null) throw new Error("the equipment tier URL value should be syntactically valid");

    const errors = getStudentComparisonSettingsErrors(student, catalog, settings);
    expect(errors).toContain("첫 번째 장비 T9 자료를 찾을 수 없어요.");
    expect(() => calculateStudentComparisonStats(student, catalog, settings)).toThrow(
      "첫 번째 장비 T9 자료를 찾을 수 없어요.",
    );
  });

  it("rejects non-null skill levels for slots with no selected skill", () => {
    const student = createStudent();
    const catalog = createCatalog();
    const parsed = parseStudentComparisonSettings(new URLSearchParams("left.skillNormal=5"), "left");

    expect(parsed.invalidFields).toEqual([]);
    const settings = parsed.settings;
    if (settings === null) throw new Error("the skill URL value should be syntactically valid");

    const errors = getStudentComparisonSettingsErrors(student, catalog, settings);
    expect(errors).toContain("기본 스킬 자료가 없어 설정을 적용할 수 없어요.");
    expect(() => calculateStudentComparisonStats(student, catalog, settings)).toThrow(
      "기본 스킬 자료가 없어 설정을 적용할 수 없어요.",
    );
  });

  it("rejects a special-gear tier missing from a catalog with a gap", () => {
    const student = createStudent();
    const catalog = createCatalog();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.gear = {
      name: "애용품",
      description: null,
      tiers: [
        {
          tier: 1,
          openFavorLevel: 1,
          maxLevel: 1,
          growthType: "STANDARD",
          learnSkillSlot: null,
          learnSkillPosition: null,
          modifiers: [],
        },
        {
          tier: 3,
          openFavorLevel: 100,
          maxLevel: 1,
          growthType: "STANDARD",
          learnSkillSlot: null,
          learnSkillPosition: null,
          modifiers: [],
        },
      ],
    } as unknown as NonNullable<typeof student.catalog.gear>;
    const parsed = parseStudentComparisonSettings(new URLSearchParams("left.equipSpecial=2"), "left");

    expect(parsed.invalidFields).toEqual([]);
    const settings = parsed.settings;
    if (settings === null) throw new Error("the special-gear URL value should be syntactically valid");

    const errors = getStudentComparisonSettingsErrors(student, catalog, settings);
    expect(errors).toContain("애용품 단계 자료를 찾을 수 없어요.");
    expect(() => calculateStudentComparisonStats(student, catalog, settings)).toThrow(
      "애용품 단계 자료를 찾을 수 없어요.",
    );
  });

  it("keeps supported equipment and gear tiers valid while their slots or favor level are locked", () => {
    const student = createStudent();
    const catalog = createCatalog();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.gear = {
      name: "애용품",
      description: null,
      tiers: [
        {
          tier: 1,
          openFavorLevel: 1,
          maxLevel: 1,
          growthType: "STANDARD",
          learnSkillSlot: null,
          learnSkillPosition: null,
          modifiers: [],
        },
        {
          tier: 2,
          openFavorLevel: 100,
          maxLevel: 1,
          growthType: "STANDARD",
          learnSkillSlot: null,
          learnSkillPosition: null,
          modifiers: [],
        },
      ],
    } as unknown as NonNullable<typeof student.catalog.gear>;
    const settings = {
      ...getDefaultStudentComparisonSettings(student, catalog),
      level: 1,
      bond: 30,
    };

    expect(getStudentComparisonSettingsErrors(student, catalog, settings)).toEqual([]);
    expect(() => calculateStudentComparisonStats(student, catalog, settings)).not.toThrow();
  });

  it("stores closed weapon and ability levels as zero and restores an adjustable weapon level", () => {
    const settings = {
      ...DEFAULT_STUDENT_COMPARISON_SETTINGS,
      weaponLevel: 40,
      abilityHp: 25,
      abilityAtk: 25,
      abilityHeal: 25,
    };
    const closed = getStudentComparisonSettingsAfterTierChange(settings, 5);
    const reopened = getStudentComparisonSettingsAfterTierChange(closed, 6);
    const restoredFromNull = getStudentComparisonSettingsAfterTierChange({ ...settings, weaponLevel: null }, 6);
    const preserved = getStudentComparisonSettingsAfterTierChange({ ...settings, weaponLevel: 20 }, 6);

    expect(closed).toMatchObject({ tier: 5, weaponLevel: 0, abilityHp: 0, abilityAtk: 0, abilityHeal: 0 });
    expect(reopened).toMatchObject({ tier: 6, weaponLevel: 1, abilityHp: 0, abilityAtk: 0, abilityHeal: 0 });
    expect(restoredFromNull.weaponLevel).toBe(1);
    expect(preserved.weaponLevel).toBe(20);
    expect(getStudentComparisonSettingsAfterTierChange(settings, 6).weaponLevel).toBe(30);
  });

  it("rejects an absent or zero weapon level when the selected tier unlocks it", () => {
    const student = createStudent();
    const catalog = createCatalog();
    for (const weaponLevel of [null, 0]) {
      const parsed = parseStudentComparisonSettings(
        new URLSearchParams(`left.tier=7&left.weaponLevel=${weaponLevel === null ? "none" : weaponLevel}`),
        "left",
      );
      const settings = parsed.settings;
      if (settings === null) throw new Error("the weapon-level URL value should be syntactically valid");

      expect(getStudentComparisonSettingsErrors(student, catalog, settings)).toContain(
        "고유무기 레벨을 1 이상 설정해 주세요.",
      );
      expect(() => calculateStudentComparisonStats(student, catalog, settings)).toThrow(
        "고유무기 레벨을 1 이상 설정해 주세요.",
      );
    }
  });

  it("requires ability levels only when ability release is applicable", () => {
    const student = createStudent();
    const catalog = createCatalog();
    const applicable = parseStudentComparisonSettings(
      new URLSearchParams("left.tier=7&left.level=90&left.abilityAtk=none"),
      "left",
    ).settings;
    if (applicable === null) throw new Error("the ability URL value should be syntactically valid");

    expect(getStudentComparisonSettingsErrors(student, catalog, applicable)).toContain(
      "능력 개방 공격력 설정을 확인해 주세요.",
    );
    expect(() => calculateStudentComparisonStats(student, catalog, applicable)).toThrow(
      "능력 개방 공격력 설정을 확인해 주세요.",
    );

    const notYetApplicable = {
      ...applicable,
      level: 89,
    };
    expect(getStudentComparisonSettingsErrors(student, catalog, notYetApplicable)).not.toContain(
      "능력 개방 공격력 설정을 확인해 주세요.",
    );
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

  it("normalizes saved nullable fields with the student-detail calculator semantics", () => {
    const settings = resolveImportedStudentComparisonSettings(createStudent(), createCatalog(), {
      level: null,
      tier: 4,
      bond: null,
      skillEx: null,
      skillNormal: null,
      skillEnhanced: null,
      skillSub: null,
      equip1: null,
      equip2: null,
      equip3: null,
      equip1Level: null,
      equip2Level: null,
      equip3Level: null,
      equipSpecial: null,
      weaponLevel: null,
      abilityHp: null,
      abilityAtk: null,
      abilityHeal: null,
    });

    expect(settings).toMatchObject({
      level: 1,
      tier: 4,
      bond: 1,
      skillEx: 1,
      equip1: 1,
      equip1Level: 10,
      equipSpecial: 0,
      weaponLevel: 0,
      abilityHp: 0,
    });
    expect(settings).not.toHaveProperty("includeSkillEffects");
  });

  it("applies unlocked weapon terrain modifiers to adaptation ranks", () => {
    const student = createStudent();
    const studentCatalog = student.catalog;
    if (!studentCatalog) throw new Error("student catalog fixture is required");
    studentCatalog.weapon.stages = [
      {
        stage: 2,
        unlocked: true,
        maxLevel: 40,
        learnSkillSlot: null,
        learnSkillPosition: null,
        modifiers: [{ stat: StudentCatalogStat.StreetBattleAdaptation, kind: "BASE", value: 1 }],
      },
      {
        stage: 3,
        unlocked: true,
        maxLevel: 50,
        learnSkillSlot: null,
        learnSkillPosition: null,
        modifiers: [{ stat: StudentCatalogStat.IndoorBattleAdaptation, kind: "BASE", value: 2 }],
      },
    ] as unknown as typeof studentCatalog.weapon.stages;
    const defaults = getDefaultStudentComparisonSettings(student, createCatalog());
    const twoStar = getStudentComparisonTerrainAdaptations(student, createCatalog(), defaults);
    const threeStar = getStudentComparisonTerrainAdaptations(student, createCatalog(), {
      ...defaults,
      tier: 8,
      weaponLevel: 50,
    });

    expect(twoStar.map(({ rank }) => rank)).toEqual(["A", "B", "B"]);
    expect(threeStar.map(({ rank }) => rank)).toEqual(["A", "B", "S"]);
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
    expect(invalid.invalidFields).toEqual(["level"]);
  });

  it("strips obsolete skill-effect URL fields without losing growth values", () => {
    const params = new URLSearchParams(
      "left=student&right=other&left.level=81&left.includeSkillEffects=false&right.includeSkillEffects=invalid",
    );

    const sanitized = stripLegacyStudentComparisonSkillEffectParams(params);

    expect(sanitized.get("left")).toBe("student");
    expect(sanitized.get("right")).toBe("other");
    expect(sanitized.get("left.level")).toBe("81");
    expect(sanitized.has("left.includeSkillEffects")).toBe(false);
    expect(sanitized.has("right.includeSkillEffects")).toBe(false);
    expect(params.has("left.includeSkillEffects")).toBe(true);
    expect(parseStudentComparisonSettings(params, "left").settings).toMatchObject({ level: 81 });
  });

  it("always includes selected permanent skill modifiers in comparison stats", () => {
    const student = createStudent();
    const catalog = createCatalog();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [{ stat: StudentCatalogStat.AttackPower, level1: 255, level100: 255 }];
    catalog.statLevelInterpolations = catalog.statLevelInterpolations.map((row) => ({
      ...row,
      ratios: [{ growthType: StudentCatalogStatGrowthType.Standard, value: 10_000 }],
    }));
    const skill = student.skills[0];
    if (!skill) throw new Error("EX skill fixture is required");
    skill.levels = [
      {
        level: 5,
        cost: null,
        statModifiers: [
          {
            stat: StudentCatalogStat.AttackPower,
            kind: StudentCatalogStatModifierKind.Base,
            value: 117,
            activation: StudentSkillModifierActivation.Unconditional,
            persistence: StudentSkillModifierPersistence.Permanent,
          },
        ],
      },
    ] as unknown as typeof skill.levels;

    const stats = calculateStudentComparisonStats(
      student,
      catalog,
      getDefaultStudentComparisonSettings(student, catalog),
    );

    expect(stats.find(({ stat }) => stat === StudentCatalogStat.AttackPower)?.value).toBe(372);
  });

  it("reports missing skill data because permanent skill effects are always applied", () => {
    const student = createStudent();
    student.skills = [] as unknown as typeof student.skills;

    expect(getStudentComparisonSettingsErrors(student, createCatalog(), DEFAULT_STUDENT_COMPARISON_SETTINGS)).toContain(
      "스킬 자료가 없어 스킬 효과를 계산할 수 없어요.",
    );
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
