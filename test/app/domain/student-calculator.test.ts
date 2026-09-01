import { describe, expect, it } from "@jest/globals";
import {
  calculateStudentStats,
  renderStudentSkillDescription,
  renderStudentSkillDescriptionParts,
  resolveStudentCalculatorState,
  type StudentCalculatorCatalog,
  type StudentCalculatorSource,
  selectStudentSkills,
  validateStudentEquipmentLevels,
} from "~/domain/student-calculator";
import {
  StudentCatalogStat,
  StudentCatalogStatGrowthType,
  StudentCatalogStatModifierKind,
  StudentSkillModifierActivation,
  StudentSkillModifierPersistence,
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

  it("interpolates equipment modifiers using the equipment level sequence", () => {
    const student = createStudent();
    const catalog = createCatalog();
    if (!student.catalog) throw new Error("student catalog fixture is required");
    student.catalog.statProfile.levelStats = [{ stat: StudentCatalogStat.MaxHp, level1: 100, level100: 100 }];
    student.catalog.starBonuses = [];
    student.catalog.potentialBonuses = [];
    student.catalog.favorRewards = [];
    student.equipments = ["hat"];
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

    expect(stats.find(({ stat }) => stat === StudentCatalogStat.MaxHp)?.value).toBe(600);
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
      calculateStudentStats(student, catalog, { ...state, level: 14 }).find(({ stat }) => stat === "MAX_HP")?.value,
    ).toBe(110);
    expect(
      calculateStudentStats(student, catalog, { ...state, level: 15 }).find(({ stat }) => stat === "MAX_HP")?.value,
    ).toBe(120);
    expect(
      calculateStudentStats(student, catalog, { ...state, level: 34 }).find(({ stat }) => stat === "MAX_HP")?.value,
    ).toBe(120);
    expect(
      calculateStudentStats(student, catalog, { ...state, level: 35 }).find(({ stat }) => stat === "MAX_HP")?.value,
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

  it("applies only unconditional permanent modifiers from the selected skill level", () => {
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

    const stats = calculateStudentStats(student, createCatalog(), emptyState);

    expect(stats.find(({ stat }) => stat === StudentCatalogStat.MaxHp)?.value).toBe(12_663);
    expect(stats.find(({ stat }) => stat === StudentCatalogStat.AttackPower)?.value).toBe(414);
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

    const stats = calculateStudentStats(student, catalog, {
      ...emptyState,
      tier: 3,
      bond: 1,
      skillEnhanced: 10,
    });

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
});

function createCatalog(): StudentCalculatorCatalog {
  return {
    version: "test",
    statLevelInterpolationEndLevel: 100,
    statLevelInterpolations: [{ level: 90, ratios: [{ growthType: "STANDARD", value: 9_000 }] }],
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

function addSelectedPassiveSkill(
  student: StudentCalculatorSource,
  statModifiers: StudentCalculatorSource["skills"][number]["levels"][number]["statModifiers"],
  level = 1,
) {
  if (!student.catalog) throw new Error("student catalog fixture is required");
  student.catalog.skillConfigurations[0].slots.push({
    slot: StudentSkillTypeEnum.Passive,
    skills: [{ position: 0, skillUid: "passive" }],
  });
  student.skills.push({
    uid: "passive",
    skillType: StudentSkillTypeEnum.Passive,
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
