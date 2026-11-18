import { describe, expect, it } from "@jest/globals";
import {
  calculateStudentStats,
  interpolateEquipmentModifier,
  renderStudentSkillDescription,
  renderStudentSkillDescriptionParts,
  resolveStudentCalculatorState,
  type StudentCalculatorCatalog,
  type StudentCalculatorSource,
  selectDisplayedStudentSkills,
  selectStudentSkills,
  validateStudentEquipmentLevels,
} from "~/domain/student-calculator";
import {
  StudentCatalogStat,
  StudentCatalogStatGrowthType,
  StudentCatalogStatModifierKind,
  StudentSkillModifierActivation,
  StudentSkillModifierPersistence,
  StudentSkillSelectionCondition,
  StudentSkillTypeEnum,
} from "~/graphql/graphql";

const emptyState = {
  level: null,
  tier: null,
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
};

describe("student calculator", () => {
  it("uses the minimum calculable values for missing state", () => {
    expect(resolveStudentCalculatorState({ initialTier: 3 }, emptyState)).toMatchObject({
      level: 1,
      tier: 3,
      bond: 1,
      skillEx: 1,
      skillNormal: 1,
      equip1: 1,
      equipSpecial: 0,
      weaponStar: 0,
      weaponLevel: 0,
      abilityHp: 0,
    });
  });

  it("derives unique weapon state from total tier", () => {
    expect(resolveStudentCalculatorState({ initialTier: 3 }, { ...emptyState, tier: 8 })).toMatchObject({
      tier: 8,
      weaponStar: 3,
      weaponLevel: 1,
    });
  });

  it("calculates level, star, potential, equipment and favor bonuses in order", () => {
    const student = createStudent();
    const catalog = createCatalog();
    const stats = calculateStudentStats(student, catalog, {
      ...emptyState,
      level: 90,
      tier: 3,
      bond: 2,
      equip1: 1,
      abilityHp: 25,
    });

    expect(stats.find(({ stat }) => stat === "MAX_HP")?.value).toBe(1_198);
    expect(stats.find(({ stat }) => stat === "DEFENSE_POWER")?.value).toBe(50);
  });

  it("defaults missing equipment levels to the selected tier maximum", () => {
    const student = createStudent();
    const catalog = createCatalog();

    expect(resolveStudentCalculatorState(student, emptyState, catalog)).toMatchObject({
      equip1: 1,
      equip1Level: 10,
      equip2Level: 1,
      equip3Level: 1,
    });
  });

  it("rejects an equipment level outside the selected catalog maximum", () => {
    const student = createStudent();
    const catalog = createCatalog();

    expect(() =>
      validateStudentEquipmentLevels(student, catalog, {
        equip1: 1,
        equip2: null,
        equip3: null,
        equip1Level: 11,
      }),
    ).toThrow("장비 1 레벨은(는) 1부터 10 사이만 입력할 수 있어요");
  });

  it("accepts an equipment level at the selected catalog maximum", () => {
    const student = createStudent();
    const catalog = createCatalog();

    expect(() =>
      validateStudentEquipmentLevels(student, catalog, {
        equip1: 1,
        equip2: null,
        equip3: null,
        equip1Level: 10,
      }),
    ).not.toThrow();
  });

  it("rejects a non-null level when the selected equipment is missing", () => {
    const student = createStudent();
    const catalog = createCatalog();
    student.equipments = ["missing"];

    expect(() =>
      validateStudentEquipmentLevels(student, catalog, {
        equip1: 1,
        equip2: null,
        equip3: null,
        equip1Level: 1,
      }),
    ).toThrow("장비 1 정보를 확인하지 못했어요");
  });

  it("interpolates equipment modifiers using the catalog growth table", () => {
    const student = createStudent();
    const catalog = createCatalog();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [{ stat: StudentCatalogStat.MaxHp, level1: 100, level100: 100 }];
    student.catalog.starBonuses = [];
    student.catalog.potentialBonuses = [];
    student.catalog.favorRewards = [];
    student.equipments = ["hat"];
    catalog.statLevelInterpolations = [
      {
        level: 50,
        ratios: [{ growthType: StudentCatalogStatGrowthType.Standard, value: 4_949 }],
      },
      {
        level: 90,
        ratios: [{ growthType: StudentCatalogStatGrowthType.Standard, value: 9_000 }],
      },
      {
        level: 100,
        ratios: [{ growthType: StudentCatalogStatGrowthType.Standard, value: 10_000 }],
      },
    ];
    catalog.equipment = [
      {
        uid: "hat-1",
        category: "hat",
        tier: 1,
        maxLevel: 10,
        growthType: StudentCatalogStatGrowthType.Standard,
        name: "모자",
        modifiers: [
          {
            stat: StudentCatalogStat.MaxHp,
            kind: StudentCatalogStatModifierKind.Base,
            level1: 100,
            levelMax: 999,
          },
        ],
      },
    ];

    const stats = calculateStudentStats(student, catalog, {
      ...emptyState,
      level: 90,
      tier: 3,
      equip1: 1,
      equip1Level: 5,
    });

    expect(stats.find(({ stat }) => stat === StudentCatalogStat.MaxHp)?.value).toBe(645);
  });

  it.each([
    {
      label: "Aru Standard",
      growthType: StudentCatalogStatGrowthType.Standard,
      level1: 162,
      level100: 1_621,
      expected: 1_032,
    },
    {
      label: "Yuzu Late Bloom",
      growthType: StudentCatalogStatGrowthType.LateBloom,
      level1: 227,
      level100: 2_272,
      expected: 1_446,
    },
    {
      label: "Iori Premature opposite growth",
      growthType: StudentCatalogStatGrowthType.Premature,
      level1: 77,
      level100: 774,
      expected: 492,
    },
  ])("normalizes exclusive-weapon growth for $label", ({ label, growthType, level1, level100, expected }) => {
    const student = createStudent();
    const catalog = createGrowthCatalog();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.growthType = StudentCatalogStatGrowthType.Standard;
    student.catalog.statProfile.levelStats = [{ stat: StudentCatalogStat.AttackPower, level1: 0, level100: 0 }];
    student.catalog.statProfile.fixedStats = [];
    student.catalog.starBonuses = [];
    student.catalog.potentialBonuses = [];
    student.catalog.favorRewards = [];
    student.catalog.gear = null;
    student.catalog.weapon = {
      name: label,
      description: null,
      imageUrl: null,
      growthType,
      levelStats: [{ stat: StudentCatalogStat.AttackPower, level1, level100 }],
      stages: [],
    };
    student.equipments = [];

    const stats = calculateStudentStats(student, catalog, {
      ...emptyState,
      level: 1,
      tier: 9,
      weaponLevel: 60,
    });

    expect(stats.find(({ stat }) => stat === StudentCatalogStat.AttackPower)?.value).toBe(expected);
  });

  it("normalizes equipment modifiers by the selected growth type endpoint", () => {
    const catalog = createGrowthCatalog();

    expect(interpolateEquipmentModifier(0, 1_000, 10, 5, StudentCatalogStatGrowthType.Premature, catalog)).toBe(495);
    expect(interpolateEquipmentModifier(0, 1_000, 10, 5, StudentCatalogStatGrowthType.LateBloom, catalog)).toBe(495);
  });

  it.each([
    StudentCatalogStatGrowthType.Standard,
    StudentCatalogStatGrowthType.Premature,
    StudentCatalogStatGrowthType.LateBloom,
  ])("keeps level-one and end-level equipment values exact for %s", (growthType) => {
    const catalog = createGrowthCatalog();
    catalog.statLevelInterpolations = [
      {
        level: 100,
        ratios: [
          { growthType: StudentCatalogStatGrowthType.Standard, value: 10_000 },
          { growthType: StudentCatalogStatGrowthType.Premature, value: 5_000 },
          { growthType: StudentCatalogStatGrowthType.LateBloom, value: 15_000 },
        ],
      },
    ];

    expect(interpolateEquipmentModifier(11, 77, 100, 1, growthType, catalog)).toBe(11);
    expect(interpolateEquipmentModifier(11, 77, 100, 100, growthType, catalog)).toBe(77);
  });

  it("fails when the current interpolation row is missing", () => {
    const catalog = createGrowthCatalog();
    catalog.statLevelInterpolations = [
      {
        level: 100,
        ratios: [{ growthType: StudentCatalogStatGrowthType.Standard, value: 10_000 }],
      },
    ];

    expect(() => interpolateEquipmentModifier(0, 1_000, 10, 5, StudentCatalogStatGrowthType.Standard, catalog)).toThrow(
      "능력치 보간 데이터가 레벨 50에 없어요",
    );
  });

  it("fails when the end interpolation row is missing", () => {
    const catalog = createGrowthCatalog();
    catalog.statLevelInterpolations = [
      {
        level: 50,
        ratios: [{ growthType: StudentCatalogStatGrowthType.Standard, value: 4_949 }],
      },
    ];

    expect(() => interpolateEquipmentModifier(0, 1_000, 10, 5, StudentCatalogStatGrowthType.Standard, catalog)).toThrow(
      "능력치 보간 종료 데이터가 레벨 100에 없어요",
    );
  });

  it("fails when the current growth type value is missing", () => {
    const catalog = createGrowthCatalog();
    catalog.statLevelInterpolations = [
      {
        level: 50,
        ratios: [{ growthType: StudentCatalogStatGrowthType.Standard, value: 4_949 }],
      },
      {
        level: 100,
        ratios: [{ growthType: StudentCatalogStatGrowthType.Standard, value: 10_000 }],
      },
    ];

    expect(() =>
      interpolateEquipmentModifier(0, 1_000, 10, 5, StudentCatalogStatGrowthType.Premature, catalog),
    ).toThrow("능력치 보간 데이터의 성장 타입 값이 레벨 50에 없어요");
  });

  it("fails when the end growth type value is missing", () => {
    const catalog = createGrowthCatalog();
    catalog.statLevelInterpolations = [
      {
        level: 50,
        ratios: [{ growthType: StudentCatalogStatGrowthType.Premature, value: 2_475 }],
      },
      {
        level: 100,
        ratios: [{ growthType: StudentCatalogStatGrowthType.Standard, value: 10_000 }],
      },
    ];

    expect(() =>
      interpolateEquipmentModifier(0, 1_000, 10, 5, StudentCatalogStatGrowthType.Premature, catalog),
    ).toThrow("능력치 보간 종료 데이터의 성장 타입 값이 레벨 100에 없어요");
  });

  it("fails when the end growth type value is zero", () => {
    const catalog = createGrowthCatalog();
    catalog.statLevelInterpolations = [
      {
        level: 50,
        ratios: [{ growthType: StudentCatalogStatGrowthType.Premature, value: 2_475 }],
      },
      {
        level: 100,
        ratios: [{ growthType: StudentCatalogStatGrowthType.Premature, value: 0 }],
      },
    ];

    expect(() =>
      interpolateEquipmentModifier(0, 1_000, 10, 5, StudentCatalogStatGrowthType.Premature, catalog),
    ).toThrow("능력치 보간 종료 데이터의 성장 타입 값이 0이에요");
  });

  it("uses level-one equipment values when the equipment max level is one", () => {
    const student = createStudent();
    const catalog = createCatalog();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [{ stat: StudentCatalogStat.MaxHp, level1: 100, level100: 100 }];
    student.catalog.starBonuses = [];
    student.catalog.potentialBonuses = [];
    student.catalog.favorRewards = [];
    catalog.equipment = [
      {
        uid: "hat-1",
        category: "hat",
        tier: 1,
        maxLevel: 1,
        growthType: StudentCatalogStatGrowthType.Standard,
        name: "모자",
        modifiers: [
          {
            stat: StudentCatalogStat.MaxHp,
            kind: StudentCatalogStatModifierKind.Base,
            level1: 123,
            levelMax: 456,
          },
        ],
      },
    ];

    const stats = calculateStudentStats(student, catalog, {
      ...emptyState,
      level: 90,
      tier: 3,
      equip1: 1,
    });

    expect(stats.find(({ stat }) => stat === StudentCatalogStat.MaxHp)?.value).toBe(223);
  });

  it("applies equipment slots only after their student-level unlocks", () => {
    const student = createStudent();
    const catalog = createCatalog();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [{ stat: StudentCatalogStat.MaxHp, level1: 100, level100: 100 }];
    student.catalog.starBonuses = [];
    student.catalog.potentialBonuses = [];
    student.catalog.favorRewards = [];
    student.equipments = ["hat", "bag", "shoes"];
    catalog.equipment = student.equipments.map((category) => ({
      uid: `${category}-1`,
      category,
      tier: 1,
      maxLevel: 1,
      growthType: StudentCatalogStatGrowthType.Standard,
      name: category,
      modifiers: [
        {
          stat: StudentCatalogStat.MaxHp,
          kind: StudentCatalogStatModifierKind.Base,
          level1: 10,
          levelMax: 10,
        },
      ],
    }));

    const state = { ...emptyState, tier: 3, equip1: 1, equip2: 1, equip3: 1 };
    expect(
      calculateStudentStats(student, catalog, { ...state, level: 9 }).find(({ stat }) => stat === "MAX_HP")?.value,
    ).toBe(110);
    expect(
      calculateStudentStats(student, catalog, { ...state, level: 10 }).find(({ stat }) => stat === "MAX_HP")?.value,
    ).toBe(120);
    expect(
      calculateStudentStats(student, catalog, { ...state, level: 19 }).find(({ stat }) => stat === "MAX_HP")?.value,
    ).toBe(120);
    expect(
      calculateStudentStats(student, catalog, { ...state, level: 20 }).find(({ stat }) => stat === "MAX_HP")?.value,
    ).toBe(130);
  });

  it("rounds final coefficient modifiers to the nearest integer", () => {
    const student = createStudent();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [{ stat: StudentCatalogStat.MaxHp, level1: 100, level100: 100 }];
    student.catalog.starBonuses = [];
    student.catalog.potentialBonuses = [];
    student.catalog.favorRewards = [];
    student.equipments = ["hat"];
    const catalog = createCatalog();
    catalog.equipment = [
      {
        uid: "hat-1",
        category: "hat",
        tier: 1,
        maxLevel: 1,
        growthType: StudentCatalogStatGrowthType.Standard,
        name: "모자",
        modifiers: [
          {
            stat: StudentCatalogStat.MaxHp,
            kind: StudentCatalogStatModifierKind.Coefficient,
            level1: 110,
            levelMax: 110,
          },
        ],
      },
    ];

    const stats = calculateStudentStats(student, catalog, { ...emptyState, level: 90, tier: 3 });

    expect(stats.find(({ stat }) => stat === StudentCatalogStat.MaxHp)?.value).toBe(101);
  });

  it("applies ability release only at student level 90 with a unique weapon", () => {
    const student = createStudent();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [{ stat: StudentCatalogStat.MaxHp, level1: 100, level100: 100 }];
    student.catalog.starBonuses = [];
    student.catalog.potentialBonuses = [{ stat: StudentCatalogStat.MaxHp, levels: [{ level: 25, rate: 1_000 }] }];
    student.catalog.favorRewards = [];
    student.equipments = [];

    const state = { ...emptyState, tier: 6, abilityHp: 25 };
    expect(
      calculateStudentStats(student, createCatalog(), { ...state, level: 89 }).find(({ stat }) => stat === "MAX_HP")
        ?.value,
    ).toBe(100);
    expect(
      calculateStudentStats(student, createCatalog(), { ...state, level: 90 }).find(({ stat }) => stat === "MAX_HP")
        ?.value,
    ).toBe(110);
  });

  it("applies favorite-item modifiers only after the required bond rank", () => {
    const student = createStudent();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [{ stat: StudentCatalogStat.MaxHp, level1: 100, level100: 100 }];
    student.catalog.starBonuses = [];
    student.catalog.potentialBonuses = [];
    student.catalog.favorRewards = [];
    student.equipments = [];
    student.catalog.gear = {
      name: "애용품",
      description: null,
      tiers: [
        {
          tier: 1,
          openFavorLevel: 15,
          maxLevel: 1,
          growthType: StudentCatalogStatGrowthType.Standard,
          learnSkillSlot: null,
          learnSkillPosition: null,
          modifiers: [
            {
              stat: StudentCatalogStat.MaxHp,
              kind: StudentCatalogStatModifierKind.Base,
              level1: 20,
              levelMax: 20,
            },
          ],
        },
      ],
    };

    const state = { ...emptyState, level: 90, tier: 3, equipSpecial: 1 };
    expect(
      calculateStudentStats(student, createCatalog(), { ...state, bond: 14 }).find(({ stat }) => stat === "MAX_HP")
        ?.value,
    ).toBe(100);
    expect(
      calculateStudentStats(student, createCatalog(), { ...state, bond: 15 }).find(({ stat }) => stat === "MAX_HP")
        ?.value,
    ).toBe(120);
  });

  it("accumulates favorite-item modifiers through the selected tier", () => {
    const student = createStudent();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [{ stat: StudentCatalogStat.DefensePower, level1: 100, level100: 100 }];
    student.catalog.statProfile.fixedStats = [];
    student.catalog.starBonuses = [];
    student.catalog.potentialBonuses = [];
    student.catalog.favorRewards = [];
    student.equipments = [];
    student.catalog.gear = {
      name: "애용품",
      description: null,
      tiers: [
        {
          tier: 1,
          openFavorLevel: 15,
          maxLevel: 1,
          growthType: StudentCatalogStatGrowthType.Standard,
          learnSkillSlot: null,
          learnSkillPosition: null,
          modifiers: [
            {
              stat: StudentCatalogStat.DefensePower,
              kind: StudentCatalogStatModifierKind.Base,
              level1: 500,
              levelMax: 500,
            },
          ],
        },
        {
          tier: 2,
          openFavorLevel: 20,
          maxLevel: 1,
          growthType: StudentCatalogStatGrowthType.Standard,
          learnSkillSlot: StudentSkillTypeEnum.Public,
          learnSkillPosition: 0,
          modifiers: [],
        },
      ],
    };

    expect(
      calculateStudentStats(student, createCatalog(), {
        ...emptyState,
        level: 90,
        tier: 3,
        bond: 20,
        equipSpecial: 2,
      }).find(({ stat }) => stat === StudentCatalogStat.DefensePower)?.value,
    ).toBe(600);
  });

  it("adds favor bonuses from related outfits", () => {
    const student = createStudent();
    const stats = calculateStudentStats(student, createCatalog(), { ...emptyState, level: 90, tier: 3, bond: 2 }, [
      {
        bond: 2,
        favorRewards: [
          {
            level: 2,
            modifiers: [{ stat: StudentCatalogStat.MaxHp, kind: StudentCatalogStatModifierKind.Base, value: 20 }],
          },
        ],
      },
    ]);

    expect(stats.find(({ stat }) => stat === "MAX_HP")?.value).toBe(1_218);
  });

  it("excludes permanent skill modifiers by default and applies them when enabled", () => {
    const student = createStudent();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [
      { stat: StudentCatalogStat.MaxHp, level1: 7_558, level100: 7_558 },
      { stat: StudentCatalogStat.AttackPower, level1: 255, level100: 255 },
    ];
    student.catalog.starBonuses = [];
    student.equipments = [];
    addSelectedPassiveSkill(student, [
      {
        stat: StudentCatalogStat.MaxHp,
        kind: StudentCatalogStatModifierKind.Base,
        value: 3_830,
        activation: StudentSkillModifierActivation.Unconditional,
        persistence: StudentSkillModifierPersistence.Permanent,
      },
      {
        stat: StudentCatalogStat.MaxHp,
        kind: StudentCatalogStatModifierKind.Coefficient,
        value: 1_120,
        activation: StudentSkillModifierActivation.Unconditional,
        persistence: StudentSkillModifierPersistence.Permanent,
      },
      {
        stat: StudentCatalogStat.AttackPower,
        kind: StudentCatalogStatModifierKind.Base,
        value: 117,
        activation: StudentSkillModifierActivation.Unconditional,
        persistence: StudentSkillModifierPersistence.Permanent,
      },
      {
        stat: StudentCatalogStat.AttackPower,
        kind: StudentCatalogStatModifierKind.Coefficient,
        value: 1_120,
        activation: StudentSkillModifierActivation.Unconditional,
        persistence: StudentSkillModifierPersistence.Permanent,
      },
      {
        stat: StudentCatalogStat.MaxHp,
        kind: StudentCatalogStatModifierKind.Base,
        value: 999,
        activation: StudentSkillModifierActivation.Conditional,
        persistence: StudentSkillModifierPersistence.Permanent,
      },
      {
        stat: StudentCatalogStat.MaxHp,
        kind: StudentCatalogStatModifierKind.Base,
        value: 999,
        activation: StudentSkillModifierActivation.Unconditional,
        persistence: StudentSkillModifierPersistence.Temporary,
      },
    ]);

    const statsWithoutSkillEffects = calculateStudentStats(student, createCatalog(), emptyState);
    const statsWithSkillEffects = calculateStudentStats(student, createCatalog(), emptyState, [], true);

    expect(statsWithoutSkillEffects.find(({ stat }) => stat === StudentCatalogStat.MaxHp)?.value).toBe(7_558);
    expect(statsWithoutSkillEffects.find(({ stat }) => stat === StudentCatalogStat.AttackPower)?.value).toBe(255);
    expect(statsWithSkillEffects.find(({ stat }) => stat === StudentCatalogStat.MaxHp)?.value).toBe(13_774);
    expect(statsWithSkillEffects.find(({ stat }) => stat === StudentCatalogStat.AttackPower)?.value).toBe(414);
  });

  it("recomputes enhanced skill levels and upgraded configurations only when enabled", () => {
    const student = createStudent();
    const catalog = createCatalog();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [{ stat: StudentCatalogStat.AttackPower, level1: 100, level100: 100 }];
    student.catalog.starBonuses = [];
    student.catalog.favorRewards = [];
    student.equipments = [];
    student.catalog.skillConfigurations = [
      {
        formIndex: 0,
        minimumWeaponStar: 0,
        minimumGearTier: 0,
        selectExSkillActionSlot: null,
        slots: [{ slot: StudentSkillTypeEnum.Passive, skills: [{ position: 0, skillUid: "passive-base" }] }],
      },
      {
        formIndex: 0,
        minimumWeaponStar: 2,
        minimumGearTier: 0,
        selectExSkillActionSlot: null,
        slots: [{ slot: StudentSkillTypeEnum.Passive, skills: [{ position: 0, skillUid: "passive-plus" }] }],
      },
    ];
    student.skills.push(
      {
        uid: "passive-base",
        skillType: StudentSkillTypeEnum.Passive,
        name: "강화 스킬",
        iconUrl: null,
        maxLevel: 10,
        levels: [
          {
            level: 1,
            cost: null,
            statModifiers: [
              {
                stat: StudentCatalogStat.AttackPower,
                kind: StudentCatalogStatModifierKind.Base,
                value: 10,
                activation: StudentSkillModifierActivation.Unconditional,
                persistence: StudentSkillModifierPersistence.Permanent,
              },
            ],
          },
          {
            level: 5,
            cost: null,
            statModifiers: [
              {
                stat: StudentCatalogStat.AttackPower,
                kind: StudentCatalogStatModifierKind.Base,
                value: 50,
                activation: StudentSkillModifierActivation.Unconditional,
                persistence: StudentSkillModifierPersistence.Permanent,
              },
            ],
          },
        ],
        description: null,
        additionalSkillUids: [],
        selectableSkills: [],
      },
      {
        uid: "passive-plus",
        skillType: StudentSkillTypeEnum.Passive,
        name: "강화 스킬+",
        iconUrl: null,
        maxLevel: 10,
        levels: [
          {
            level: 1,
            cost: null,
            statModifiers: [
              {
                stat: StudentCatalogStat.AttackPower,
                kind: StudentCatalogStatModifierKind.Base,
                value: 20,
                activation: StudentSkillModifierActivation.Unconditional,
                persistence: StudentSkillModifierPersistence.Permanent,
              },
            ],
          },
        ],
        description: null,
        additionalSkillUids: [],
        selectableSkills: [],
      },
    );

    const baseState = { ...emptyState, skillEnhanced: 1 };
    const statsWithoutSkillEffects = calculateStudentStats(student, catalog, baseState);
    const statsWithoutSkillEffectsAtLevelFive = calculateStudentStats(student, catalog, {
      ...baseState,
      skillEnhanced: 5,
    });
    const statsWithBaseSkill = calculateStudentStats(student, catalog, baseState, [], true);
    const statsWithLevelFiveSkill = calculateStudentStats(
      student,
      catalog,
      { ...baseState, skillEnhanced: 5 },
      [],
      true,
    );
    const statsWithBaseSkillAtWeaponStarOne = calculateStudentStats(
      student,
      catalog,
      { ...baseState, tier: 6 },
      [],
      true,
    );
    const statsWithUpgradedSkill = calculateStudentStats(student, catalog, { ...baseState, tier: 7 }, [], true);

    expect(statsWithoutSkillEffects.find(({ stat }) => stat === StudentCatalogStat.AttackPower)?.value).toBe(100);
    expect(statsWithoutSkillEffectsAtLevelFive.find(({ stat }) => stat === StudentCatalogStat.AttackPower)?.value).toBe(
      100,
    );
    expect(statsWithBaseSkill.find(({ stat }) => stat === StudentCatalogStat.AttackPower)?.value).toBe(110);
    expect(statsWithLevelFiveSkill.find(({ stat }) => stat === StudentCatalogStat.AttackPower)?.value).toBe(150);
    expect(statsWithBaseSkillAtWeaponStarOne.find(({ stat }) => stat === StudentCatalogStat.AttackPower)?.value).toBe(
      110,
    );
    expect(statsWithUpgradedSkill.find(({ stat }) => stat === StudentCatalogStat.AttackPower)?.value).toBe(120);
  });

  it.each([
    StudentSkillModifierActivation.Conditional,
    StudentSkillModifierActivation.Unconditional,
  ])("does not apply %s passive-skill modifiers before the two-star unlock", (activation) => {
    const student = createStudent();
    student.initialTier = 1;
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [{ stat: StudentCatalogStat.AttackPower, level1: 100, level100: 100 }];
    student.catalog.starBonuses = [];
    student.catalog.potentialBonuses = [];
    student.catalog.favorRewards = [];
    student.equipments = [];
    addSelectedPassiveSkill(student, [
      {
        stat: StudentCatalogStat.AttackPower,
        kind: StudentCatalogStatModifierKind.Coefficient,
        value: 2_660,
        activation,
        persistence: StudentSkillModifierPersistence.Permanent,
      },
    ]);

    expect(
      calculateStudentStats(student, createCatalog(), { ...emptyState, tier: 1 }, [], true).find(
        ({ stat }) => stat === StudentCatalogStat.AttackPower,
      )?.value,
    ).toBe(100);
    expect(
      calculateStudentStats(student, createCatalog(), { ...emptyState, tier: 2 }, [], true).find(
        ({ stat }) => stat === StudentCatalogStat.AttackPower,
      )?.value,
    ).toBe(127);
  });

  it("does not apply extra-passive modifiers before the three-star unlock", () => {
    const student = createStudent();
    student.initialTier = 1;
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [{ stat: StudentCatalogStat.AttackPower, level1: 100, level100: 100 }];
    student.catalog.starBonuses = [];
    student.catalog.potentialBonuses = [];
    student.catalog.favorRewards = [];
    student.equipments = [];
    addSelectedPassiveSkill(
      student,
      [
        {
          stat: StudentCatalogStat.AttackPower,
          kind: StudentCatalogStatModifierKind.Coefficient,
          value: 2_660,
          activation: StudentSkillModifierActivation.Unconditional,
          persistence: StudentSkillModifierPersistence.Permanent,
        },
      ],
      1,
      StudentSkillTypeEnum.ExtraPassive,
    );

    expect(
      calculateStudentStats(student, createCatalog(), { ...emptyState, tier: 2 }, [], true).find(
        ({ stat }) => stat === StudentCatalogStat.AttackPower,
      )?.value,
    ).toBe(100);
    expect(
      calculateStudentStats(student, createCatalog(), { ...emptyState, tier: 3 }, [], true).find(
        ({ stat }) => stat === StudentCatalogStat.AttackPower,
      )?.value,
    ).toBe(127);
  });

  it("matches SchaleDB's flat-then-coefficient stat breakdown", () => {
    const student = createStudent();
    const catalog = createCatalog();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [
      { stat: StudentCatalogStat.MaxHp, level1: 2_992, level100: 2_992 },
      { stat: StudentCatalogStat.AttackPower, level1: 121, level100: 121 },
    ];
    student.catalog.starBonuses = [
      {
        star: 2,
        modifiers: [
          { stat: StudentCatalogStat.MaxHp, kind: StudentCatalogStatModifierKind.Coefficient, value: 500 },
          { stat: StudentCatalogStat.AttackPower, kind: StudentCatalogStatModifierKind.Coefficient, value: 1_000 },
        ],
      },
      {
        star: 3,
        modifiers: [
          { stat: StudentCatalogStat.MaxHp, kind: StudentCatalogStatModifierKind.Coefficient, value: 700 },
          { stat: StudentCatalogStat.AttackPower, kind: StudentCatalogStatModifierKind.Coefficient, value: 1_200 },
        ],
      },
    ];
    student.catalog.favorRewards = [
      {
        level: 1,
        modifiers: [
          { stat: StudentCatalogStat.MaxHp, kind: StudentCatalogStatModifierKind.Base, value: 2_260 },
          { stat: StudentCatalogStat.AttackPower, kind: StudentCatalogStatModifierKind.Base, value: 136 },
        ],
      },
    ];
    student.equipments = ["bag", "hat"];
    catalog.equipment = [
      {
        uid: "bag-1",
        category: "bag",
        tier: 1,
        maxLevel: 10,
        growthType: StudentCatalogStatGrowthType.Standard,
        name: "가방",
        modifiers: [
          { stat: StudentCatalogStat.MaxHp, kind: StudentCatalogStatModifierKind.Base, level1: 60, levelMax: 600 },
        ],
      },
      {
        uid: "hat-1",
        category: "hat",
        tier: 1,
        maxLevel: 10,
        growthType: StudentCatalogStatGrowthType.Standard,
        name: "모자",
        modifiers: [
          {
            stat: StudentCatalogStat.AttackPower,
            kind: StudentCatalogStatModifierKind.Coefficient,
            level1: 80,
            levelMax: 800,
          },
        ],
      },
    ];
    addSelectedPassiveSkill(
      student,
      [
        {
          stat: StudentCatalogStat.MaxHp,
          kind: StudentCatalogStatModifierKind.Coefficient,
          value: 1_624,
          activation: StudentSkillModifierActivation.Unconditional,
          persistence: StudentSkillModifierPersistence.Permanent,
        },
        {
          stat: StudentCatalogStat.AttackPower,
          kind: StudentCatalogStatModifierKind.Coefficient,
          value: 1_624,
          activation: StudentSkillModifierActivation.Unconditional,
          persistence: StudentSkillModifierPersistence.Permanent,
        },
      ],
      10,
    );

    const stats = calculateStudentStats(
      student,
      catalog,
      {
        ...emptyState,
        tier: 3,
        bond: 1,
        skillEnhanced: 10,
      },
      [],
      true,
    );

    expect(stats.find(({ stat }) => stat === StudentCatalogStat.MaxHp)?.value).toBe(7_221);
    expect(stats.find(({ stat }) => stat === StudentCatalogStat.AttackPower)?.value).toBe(330);
  });

  it("selects the component-wise maximal skill configuration and renders its level", () => {
    const student = createStudent();
    const skills = selectStudentSkills(student, { ...emptyState, tier: 7, equipSpecial: 2, skillEx: 4 });

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ uid: "ex-upgraded", selectedLevel: 4, slot: "ex" });
    expect(renderStudentSkillDescription(skills[0])).toBe("피해량 400%");
    expect(renderStudentSkillDescriptionParts(skills[0])).toEqual([
      { key: "text-0", text: "피해량 ", dynamic: false, emphasized: false },
      { key: "value-4", text: "400%", dynamic: true, emphasized: true },
    ]);
  });

  describe("displayed skills", () => {
    it("shows entries that repeat the same skill text in a slot once", () => {
      // CH0346Public01/02 (이로하(수영복)) differ only by uid.
      const skills = [
        displaySkill("public-1", { name: "피차 고생인데." }),
        displaySkill("public-2", { name: "피차 고생인데." }),
        displaySkill("passive-1", { name: "약점이 드러났네요." }),
      ];
      const rows = selectDisplayedStudentSkills(
        [
          selected(skills[0], StudentSkillTypeEnum.Public, 0),
          selected(skills[1], StudentSkillTypeEnum.Public, 1),
          selected(skills[2], StudentSkillTypeEnum.Passive, 0),
        ],
        skills,
      );

      expect(rows.map((row) => row.skill.uid)).toEqual(["public-1", "passive-1"]);
    });

    it("hides entries that repeat a linked skill and keeps the links once", () => {
      // CH0187GearPublic01 links GearPublic02; GearPublic03 repeats 01 and GearPublic04 repeats 02 (토키).
      const skills = [
        displaySkill("gear-1", { name: "전술적 판단+", template: "해제 시", additionalSkillUids: ["gear-2"] }),
        displaySkill("gear-2", { name: "전술적 판단+", template: "전환 시" }),
        displaySkill("gear-3", { name: "전술적 판단+", template: "해제 시" }),
        displaySkill("gear-4", { name: "전술적 판단+", template: "전환 시" }),
      ];
      const rows = selectDisplayedStudentSkills(
        [
          selected(skills[0], StudentSkillTypeEnum.Public, 0),
          selected(skills[2], StudentSkillTypeEnum.Public, 2),
          selected(skills[3], StudentSkillTypeEnum.Public, 3),
        ],
        skills,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].skill.uid).toBe("gear-1");
      expect(rows[0].linkedSkills.map(({ skill, link }) => [skill.uid, link.kind])).toEqual([["gear-2", "additional"]]);
    });

    it("moves the links of a hidden entry onto the entry it repeats", () => {
      const skills = [
        displaySkill("ex-1", { name: "EX" }),
        displaySkill("ex-2", {
          name: "EX",
          selectableSkills: [{ condition: StudentSkillSelectionCondition.Enemy, skillUid: "ex-enemy" }],
        }),
        displaySkill("ex-enemy", { name: "적 EX" }),
      ];
      const rows = selectDisplayedStudentSkills(
        [selected(skills[0], StudentSkillTypeEnum.Ex, 0), selected(skills[1], StudentSkillTypeEnum.Ex, 1)],
        skills,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].linkedSkills).toEqual([
        { skill: skills[2], link: { kind: "selectable", condition: StudentSkillSelectionCondition.Enemy } },
      ]);
    });

    it("describes a selectable skill only through its choices", () => {
      // CH0294SelectEx01 (미카(수영복)) stores "" at level 1 and "0" above as its own text.
      const skills = [
        displaySkill("select-ex", {
          name: "잊을 수 없는 추억",
          template: "{{1}}",
          values: ["0"],
          selectableSkills: [
            { condition: StudentSkillSelectionCondition.Enemy, skillUid: "ex-enemy" },
            { condition: StudentSkillSelectionCondition.Self, skillUid: "ex-self" },
          ],
        }),
        displaySkill("ex-enemy", { name: "밤하늘의 유성" }),
        displaySkill("ex-self", { name: "조용한 다짐" }),
        displaySkill("public-1", { name: "일반" }),
      ];
      const rows = selectDisplayedStudentSkills(
        [selected(skills[0], StudentSkillTypeEnum.Ex, 0), selected(skills[3], StudentSkillTypeEnum.Public, 0)],
        skills,
      );

      expect(rows.map((row) => [row.skill.uid, row.showsOwnDescription])).toEqual([
        ["select-ex", false],
        ["public-1", true],
      ]);
      expect(rows[0].linkedSkills.map(({ skill }) => skill.uid)).toEqual(["ex-enemy", "ex-self"]);
    });

    it("keeps entries whose displayed values or slots differ", () => {
      const base = displaySkill("public-1", { name: "같은 이름", values: ["10%"] });
      const otherValue = displaySkill("public-2", { name: "같은 이름", values: ["20%"] });
      const otherIcon = displaySkill("public-3", { name: "같은 이름", values: ["10%"], iconUrl: "other.webp" });
      const otherSlot = displaySkill("passive-1", { name: "같은 이름", values: ["10%"] });
      const rows = selectDisplayedStudentSkills(
        [
          selected(base, StudentSkillTypeEnum.Public, 0),
          selected(otherValue, StudentSkillTypeEnum.Public, 1),
          selected(otherIcon, StudentSkillTypeEnum.Public, 2),
          selected(otherSlot, StudentSkillTypeEnum.Passive, 0),
        ],
        [base, otherValue, otherIcon, otherSlot],
      );

      expect(rows.map((row) => row.skill.uid)).toEqual(["public-1", "public-2", "public-3", "passive-1"]);
    });
  });
});

type DisplaySkill = StudentCalculatorSource["skills"][number];

function displaySkill(
  uid: string,
  options: {
    name: string;
    template?: string;
    values?: string[];
    iconUrl?: string;
    additionalSkillUids?: string[];
    selectableSkills?: DisplaySkill["selectableSkills"];
  },
): DisplaySkill {
  return {
    uid,
    skillType: StudentSkillTypeEnum.Public,
    name: options.name,
    iconUrl: options.iconUrl ?? "icon.webp",
    maxLevel: 10,
    levels: [{ level: 1, cost: 0, statModifiers: [] }],
    description: {
      template: options.template ?? "공격력 {{1}} 증가",
      parameters: [{ id: 1, emphasized: true, values: [{ level: 1, text: options.values?.[0] ?? "10%" }] }],
    },
    additionalSkillUids: options.additionalSkillUids ?? [],
    selectableSkills: options.selectableSkills ?? [],
  } as DisplaySkill;
}

function selected(skill: DisplaySkill, slot: StudentSkillTypeEnum, position: number) {
  return { ...skill, slot, position, selectedLevel: 1 };
}

function createCatalog(): StudentCalculatorCatalog {
  return {
    version: "test",
    statLevelInterpolationEndLevel: 100,
    statLevelInterpolations: createStandardInterpolationRows(),
    equipment: [
      {
        uid: "hat-1",
        category: "hat",
        tier: 1,
        maxLevel: 10,
        growthType: "STANDARD",
        name: "모자",
        modifiers: [{ stat: "MAX_HP", kind: "BASE", level1: 1, levelMax: 5 }],
      },
    ],
  } as unknown as StudentCalculatorCatalog;
}

function createStandardInterpolationRows() {
  return Array.from({ length: 99 }, (_, index) => {
    const level = index + 2;
    return {
      level,
      ratios: [
        {
          growthType: StudentCatalogStatGrowthType.Standard,
          value: level === 90 ? 9_000 : Math.round(((level - 1) * 10_000) / 99),
        },
      ],
    };
  });
}

function createGrowthRatios({
  standard,
  premature,
  lateBloom,
}: {
  standard: number;
  premature: number;
  lateBloom: number;
}) {
  return [
    { growthType: StudentCatalogStatGrowthType.Standard, value: standard },
    { growthType: StudentCatalogStatGrowthType.Premature, value: premature },
    { growthType: StudentCatalogStatGrowthType.LateBloom, value: lateBloom },
  ];
}

function createGrowthCatalog(): StudentCalculatorCatalog {
  return {
    ...createCatalog(),
    statLevelInterpolations: [
      {
        level: 50,
        ratios: createGrowthRatios({ standard: 4_949, premature: 2_475, lateBloom: 7_425 }),
      },
      {
        level: 60,
        ratios: createGrowthRatios({ standard: 5_960, premature: 2_980, lateBloom: 8_939 }),
      },
      {
        level: 100,
        ratios: createGrowthRatios({ standard: 10_000, premature: 5_000, lateBloom: 15_000 }),
      },
    ],
  } as unknown as StudentCalculatorCatalog;
}

function addSelectedPassiveSkill(
  student: StudentCalculatorSource,
  statModifiers: StudentCalculatorSource["skills"][number]["levels"][number]["statModifiers"],
  level = 1,
  slot: StudentSkillTypeEnum = StudentSkillTypeEnum.Passive,
) {
  if (!student.catalog) throw new Error("student catalog fixture is required");
  const skillUid = slot === StudentSkillTypeEnum.ExtraPassive ? "extra-passive" : "passive";
  student.catalog.skillConfigurations[0].slots.push({
    slot,
    skills: [{ position: 0, skillUid }],
  });
  student.skills.push({
    uid: skillUid,
    skillType: slot,
    name: "강화 스킬",
    iconUrl: null,
    maxLevel: 10,
    levels: [{ level, cost: null, statModifiers }],
    description: null,
    additionalSkillUids: [],
    selectableSkills: [],
  });
}

function createStudent(): StudentCalculatorSource {
  return {
    uid: "student",
    name: "학생",
    initialTier: 3,
    equipments: ["hat"],
    catalog: {
      statProfile: {
        growthType: "STANDARD",
        levelStats: [{ stat: "MAX_HP", level1: 100, level100: 1_000 }],
        fixedStats: [{ stat: "DEFENSE_POWER", value: 50 }],
      },
      starBonuses: [
        { star: 2, modifiers: [{ stat: "MAX_HP", kind: "COEFFICIENT", value: 1_000 }] },
        { star: 3, modifiers: [{ stat: "MAX_HP", kind: "COEFFICIENT", value: 2_000 }] },
      ],
      potentialBonuses: [{ stat: "MAX_HP", levels: [{ level: 25, rate: 1_000 }] }],
      favorRewards: [{ level: 2, modifiers: [{ stat: "MAX_HP", kind: "BASE", value: 10 }] }],
      weapon: {
        name: "고유무기",
        description: null,
        imageUrl: null,
        growthType: "STANDARD",
        levelStats: [],
        stages: [],
      },
      gear: null,
      profile: {},
      terrainAdaptations: { street: "B", outdoor: "B", indoor: "B" },
      skillConfigurations: [
        {
          formIndex: 0,
          minimumWeaponStar: 0,
          minimumGearTier: 0,
          selectExSkillActionSlot: null,
          slots: [{ slot: "ex", skills: [{ position: 0, skillUid: "ex-base" }] }],
        },
        {
          formIndex: 0,
          minimumWeaponStar: 2,
          minimumGearTier: 2,
          selectExSkillActionSlot: null,
          slots: [{ slot: "ex", skills: [{ position: 0, skillUid: "ex-upgraded" }] }],
        },
      ],
    },
    skills: [
      {
        uid: "ex-base",
        skillType: "ex",
        name: "기본 EX",
        iconUrl: null,
        maxLevel: 5,
        levels: [],
        description: null,
        additionalSkillUids: [],
        selectableSkills: [],
      },
      {
        uid: "ex-upgraded",
        skillType: "ex",
        name: "강화 EX",
        iconUrl: null,
        maxLevel: 5,
        levels: [],
        description: {
          template: "피해량 {{1}}",
          parameters: [
            {
              id: 1,
              emphasized: true,
              values: [{ level: 4, text: "400%" }],
            },
          ],
        },
        additionalSkillUids: [],
        selectableSkills: [],
      },
    ],
  } as unknown as StudentCalculatorSource;
}
