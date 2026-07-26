import { describe, expect, it } from "@jest/globals";
import {
  calculateStudentStats,
  renderStudentSkillDescription,
  renderStudentSkillDescriptionParts,
  resolveStudentCalculatorState,
  type StudentCalculatorCatalog,
  type StudentCalculatorSource,
  selectStudentSkills,
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

    expect(stats.find(({ stat }) => stat === "MAX_HP")?.value).toBe(1_289);
    expect(stats.find(({ stat }) => stat === "DEFENSE_POWER")?.value).toBe(50);
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

    expect(stats.find(({ stat }) => stat === StudentCatalogStat.MaxHp)?.value).toBe(12_664);
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
    expect(stats.find(({ stat }) => stat === StudentCatalogStat.AttackPower)?.value).toBe(353);
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
