import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Attack, Defense } from "~/graphql/graphql";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getRelationshipLevels } from "~/models/relationship-level";
import type { StudentGrowthEquipment, StudentGrowthVisuals } from "~/models/student";
import {
  getAllStudents,
  getStudentGrowthEquipmentCatalog,
  getStudentGrowthVisualsBatch,
  getStudentWeaponAvailability,
} from "~/models/student";
import { canViewUserStudentGrowth, getUserStudentsView } from "~/views/user-students.server";

jest.mock("~/models/recruited-student", () => ({
  getRecruitedStudents: jest.fn(),
}));

jest.mock("~/models/relationship-level", () => ({
  getRelationshipLevels: jest.fn(),
}));

jest.mock("~/models/student", () => ({
  getAllStudents: jest.fn(),
  getStudentGrowthEquipmentCatalog: jest.fn(),
  getStudentGrowthVisualsBatch: jest.fn(),
  getStudentWeaponAvailability: jest.fn(),
}));

const env = {} as Env;
const mockedGetRecruitedStudents = getRecruitedStudents as jest.MockedFunction<typeof getRecruitedStudents>;
const mockedGetRelationshipLevels = getRelationshipLevels as jest.MockedFunction<typeof getRelationshipLevels>;
const mockedGetAllStudents = getAllStudents as jest.MockedFunction<typeof getAllStudents>;
const mockedGetStudentWeaponAvailability = getStudentWeaponAvailability as jest.MockedFunction<
  typeof getStudentWeaponAvailability
>;
const mockedGetStudentGrowthVisualsBatch = getStudentGrowthVisualsBatch as jest.MockedFunction<
  typeof getStudentGrowthVisualsBatch
>;
const mockedGetStudentGrowthEquipmentCatalog = getStudentGrowthEquipmentCatalog as jest.MockedFunction<
  typeof getStudentGrowthEquipmentCatalog
>;

const sensei = {
  id: 1,
  uid: "sensei-1",
  username: "teacher",
  friendCode: null,
  profileStudentId: null,
  bio: null,
  active: true,
  role: "guest" as const,
  profileVisibility: "public" as const,
  growthVisibility: false,
};

const student = {
  uid: "student-a",
  name: "아루",
  attackType: Attack.Explosive,
  defenseType: Defense.Light,
  role: "striker" as const,
  position: "front" as const,
  tacticRole: "attacker" as const,
  order: 1,
  initialTier: 3,
  released: true,
  equipments: ["hat", "", "watch"],
  familyName: null,
  altNames: [],
  school: "게헨나",
  birthday: "0000-01-01",
};

const recruitedStudent = {
  uid: "recruited-a",
  studentUid: "student-a",
  tier: 6,
  level: 80,
  skillEx: 5,
  skillNormal: 10,
  skillEnhanced: 9,
  skillSub: 8,
  equip1: 7,
  equip2: null,
  equip3: 5,
  equip1Level: 70,
  equip2Level: 50,
  equip3Level: 30,
  equipSpecial: 2,
  weaponLevel: 20,
  abilityHp: 10,
  abilityAtk: 11,
  abilityHeal: 12,
};

const orphanRecruitedStudent = {
  ...recruitedStudent,
  uid: "recruited-orphan",
  studentUid: "student-orphan",
};

const growthVisuals = {
  gearAvailable: true,
  skillConfigurations: [
    {
      formIndex: 0,
      minimumWeaponStar: 0,
      minimumGearTier: 0,
      slots: [
        { slot: "ex", skills: [{ position: 0, skillUid: "skill-ex" }] },
        { slot: "public", skills: [{ position: 0, skillUid: "skill-normal" }] },
        { slot: "passive", skills: [{ position: 0, skillUid: "skill-enhanced" }] },
        { slot: "extra_passive", skills: [{ position: 0, skillUid: "skill-sub" }] },
      ],
    },
  ],
  skills: [
    { uid: "skill-ex", skillType: "ex", iconUrl: "https://assets.test/ex", maxLevel: 5 },
    { uid: "skill-normal", skillType: "public", iconUrl: "https://assets.test/normal", maxLevel: 10 },
    { uid: "skill-enhanced", skillType: "passive", iconUrl: "https://assets.test/enhanced", maxLevel: 10 },
    { uid: "skill-sub", skillType: "extra_passive", iconUrl: "https://assets.test/sub", maxLevel: 10 },
  ],
} as unknown as StudentGrowthVisuals;

const equipmentCatalog = [
  { uid: "hat-7", category: "hat", tier: 7, maxLevel: 60 },
  { uid: "watch-5", category: "watch", tier: 5, maxLevel: 50 },
] as StudentGrowthEquipment;

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetRecruitedStudents.mockResolvedValue([recruitedStudent]);
  mockedGetAllStudents.mockResolvedValue([student]);
  mockedGetStudentWeaponAvailability.mockResolvedValue(new Map([["student-a", true]]));
  mockedGetStudentGrowthVisualsBatch.mockResolvedValue(new Map([["student-a", growthVisuals]]));
  mockedGetStudentGrowthEquipmentCatalog.mockResolvedValue(equipmentCatalog);
  mockedGetRelationshipLevels.mockResolvedValue([{ studentId: "student-a", currentLevel: 42 }] as never);
});

describe("user students view", () => {
  it("keeps growth state private and avoids growth-resource calls in summary mode", async () => {
    const result = await getUserStudentsView(env, sensei, 2, "growth");

    expect(result.view).toBe("summary");
    expect(result.canViewGrowth).toBe(false);
    expect(result.students[0]?.growth).toBeUndefined();
    expect(mockedGetStudentWeaponAvailability).not.toHaveBeenCalled();
  });

  it("projects the stored growth values raw, with the catalog data the table needs", async () => {
    const result = await getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth");

    expect(result.view).toBe("growth");
    expect(result.students[0]).toMatchObject({
      uid: "student-a",
      tier: 6,
      growth: {
        bond: 42,
        level: 80,
        weaponLevel: 20,
        skillEx: 5,
        skillNormal: 10,
        skillEnhanced: 9,
        skillSub: 8,
        equipSpecial: 2,
        equipSpecialAvailable: true,
        weaponAvailable: true,
        abilityHp: 10,
        abilityAtk: 11,
        abilityHeal: 12,
        equipment: [
          { available: true, category: "hat", tier: 7, level: 70, maxLevel: 60, uid: "hat-7" },
          { available: false, category: null, tier: null, level: null, maxLevel: null, uid: null },
          { available: true, category: "watch", tier: 5, level: 30, maxLevel: 50, uid: "watch-5" },
        ],
      },
    });
    expect(result.equipmentLimits).toEqual([
      { category: "hat", tier: 7, maxLevel: 60 },
      { category: "watch", tier: 5, maxLevel: 50 },
    ]);
  });

  it("keeps a missing bond as null instead of inventing a rank", async () => {
    mockedGetRelationshipLevels.mockResolvedValueOnce([]);

    const result = await getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth");

    expect(result.students[0]?.growth?.bond).toBeNull();
  });

  it("omits recruited rows missing from the released catalog before growth lookups", async () => {
    mockedGetRecruitedStudents.mockResolvedValueOnce([recruitedStudent, orphanRecruitedStudent]);

    const result = await getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth");

    expect(result.noRecruited).toBe(false);
    expect(result.students.map(({ uid }) => uid)).toEqual(["student-a"]);
    expect(mockedGetStudentWeaponAvailability).toHaveBeenCalledWith(env, ["student-a"]);
    expect(mockedGetStudentGrowthVisualsBatch).toHaveBeenCalledWith(env, ["student-a"]);
  });

  it("treats orphan-only recruited rows as no visible recruited students", async () => {
    mockedGetRecruitedStudents.mockResolvedValueOnce([orphanRecruitedStudent]);

    const result = await getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth");

    expect(result.noRecruited).toBe(true);
    expect(result.students.filter(({ tier }) => tier !== null)).toEqual([]);
    expect(result.students.find(({ uid }) => uid === "student-orphan")).toBeUndefined();
    expect(mockedGetStudentWeaponAvailability).toHaveBeenCalledWith(env, []);
    expect(mockedGetStudentGrowthVisualsBatch).toHaveBeenCalledWith(env, []);
  });

  it.each([
    ["owner public profile with sharing off", 1, "public", false, true],
    ["owner public profile with sharing on", 1, "public", true, true],
    ["owner private profile with sharing off", 1, "private", false, true],
    ["owner private profile with sharing on", 1, "private", true, true],
    ["anonymous public profile with sharing off", undefined, "public", false, false],
    ["anonymous public profile with sharing on", undefined, "public", true, true],
    ["anonymous private profile with sharing off", undefined, "private", false, false],
    ["anonymous private profile with sharing on", undefined, "private", true, false],
    ["other user public profile with sharing off", 2, "public", false, false],
    ["other user public profile with sharing on", 2, "public", true, true],
    ["other user private profile with sharing off", 2, "private", false, false],
    ["other user private profile with sharing on", 2, "private", true, false],
  ] as const)("applies growth visibility rules for %s", async (_caseName, viewerUserId, profileVisibility, growthVisibility, expected) => {
    const viewedSensei = { ...sensei, profileVisibility, growthVisibility };
    const result = await getUserStudentsView(env, viewedSensei, viewerUserId, "growth");

    expect(canViewUserStudentGrowth(viewedSensei, viewerUserId)).toBe(expected);
    expect(result.growthVisibility).toBe(growthVisibility);
    expect(result.view).toBe(expected ? "growth" : "summary");
    expect(result.students[0]?.growth).toEqual(expected ? expect.any(Object) : undefined);
    expect(mockedGetStudentWeaponAvailability).toHaveBeenCalledTimes(expected ? 1 : 0);
    expect(mockedGetStudentGrowthVisualsBatch).toHaveBeenCalledTimes(expected ? 1 : 0);
    expect(mockedGetStudentGrowthEquipmentCatalog).toHaveBeenCalledTimes(expected ? 1 : 0);
  });

  it("fails closed when a recruited student is omitted from the weapon catalog response", async () => {
    mockedGetStudentWeaponAvailability.mockResolvedValueOnce(new Map());

    await expect(getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth")).rejects.toThrow(
      "학생 고유무기 정보를 확인하지 못했어요",
    );
    expect(mockedGetStudentWeaponAvailability).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a recruited student is omitted from the growth visuals response", async () => {
    mockedGetStudentGrowthVisualsBatch.mockResolvedValueOnce(new Map());

    await expect(getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth")).rejects.toThrow(
      "학생 성장 시각 자료를 확인하지 못했어요",
    );
  });

  it("uses catalog gear availability for the favorite item state", async () => {
    mockedGetStudentGrowthVisualsBatch.mockResolvedValueOnce(
      new Map([["student-a", { ...growthVisuals, gearAvailable: false }]]),
    );

    const result = await getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth");

    expect(result.students[0]?.growth).toMatchObject({ equipSpecialAvailable: false });
  });

  it("fails closed when a stored equipment tier is missing from the shared catalog", async () => {
    mockedGetStudentGrowthEquipmentCatalog.mockResolvedValueOnce([
      { uid: "watch-5", category: "watch", tier: 5, maxLevel: 50 },
    ]);

    await expect(getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth")).rejects.toThrow(
      "학생 성장 시각 자료의 장비 티어를 확인하지 못했어요",
    );
  });
});
