import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Attack, Defense } from "~/graphql/graphql";
import { getRecruitedStudents } from "~/models/recruited-student";
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

jest.mock("~/models/student", () => ({
  getAllStudents: jest.fn(),
  getStudentGrowthEquipmentCatalog: jest.fn(),
  getStudentGrowthVisualsBatch: jest.fn(),
  getStudentWeaponAvailability: jest.fn(),
}));

const env = {} as Env;
const mockedGetRecruitedStudents = getRecruitedStudents as jest.MockedFunction<typeof getRecruitedStudents>;
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
  birthday: new Date("2000-01-01T00:00:00.000Z"),
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
  { uid: "hat-7", category: "hat", tier: 7 },
  { uid: "watch-5", category: "watch", tier: 5 },
] as StudentGrowthEquipment;

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetRecruitedStudents.mockResolvedValue([recruitedStudent]);
  mockedGetAllStudents.mockResolvedValue([student]);
  mockedGetStudentWeaponAvailability.mockResolvedValue(new Map([["student-a", true]]));
  mockedGetStudentGrowthVisualsBatch.mockResolvedValue(new Map([["student-a", growthVisuals]]));
  mockedGetStudentGrowthEquipmentCatalog.mockResolvedValue(equipmentCatalog);
});

describe("user students view", () => {
  it("keeps growth state private and avoids growth-resource calls in summary mode", async () => {
    const result = await getUserStudentsView(env, sensei, 2, "growth");

    expect(result.view).toBe("summary");
    expect(result.canViewGrowth).toBe(false);
    expect(result.students[0]?.growth).toBeUndefined();
    expect(mockedGetStudentWeaponAvailability).not.toHaveBeenCalled();
  });

  it("projects only applicable public growth fields and hides stored levels and weapon state", async () => {
    const result = await getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth");

    expect(result.view).toBe("growth");
    expect(result.students[0]).toMatchObject({
      uid: "student-a",
      tier: 6,
      growth: {
        level: 80,
        equipSpecial: 2,
        equipSpecialAvailable: true,
        abilityHp: 10,
        abilityAtk: 11,
        abilityHeal: 12,
        abilityAvailable: true,
        skillVisuals: {
          ex: { iconUrl: "https://assets.test/ex", level: 5, maxLevel: 5 },
          normal: { iconUrl: "https://assets.test/normal", level: 10, maxLevel: 10 },
          enhanced: { iconUrl: "https://assets.test/enhanced", level: 9, maxLevel: 10 },
          sub: { iconUrl: "https://assets.test/sub", level: 8, maxLevel: 10 },
        },
        equipmentVisuals: [
          { available: true, uid: "hat-7", tier: 7 },
          { available: false, uid: null, tier: null },
          { available: true, uid: "watch-5", tier: 5 },
        ],
      },
    });
    expect(result.students[0]?.growth).not.toHaveProperty("weaponLevel");
    expect(result.students[0]?.growth).not.toHaveProperty("skillEx");
    expect(result.students[0]?.growth).not.toHaveProperty("skillNormal");
    expect(result.students[0]?.growth).not.toHaveProperty("skillEnhanced");
    expect(result.students[0]?.growth).not.toHaveProperty("skillSub");
    expect(result.students[0]?.growth).not.toHaveProperty("equip1");
    expect(result.students[0]?.growth).not.toHaveProperty("equip2");
    expect(result.students[0]?.growth).not.toHaveProperty("equip3");
    expect(result.students[0]?.growth).not.toHaveProperty("equipmentAvailable");
    expect(result.students[0]?.growth).not.toHaveProperty("equip1Level");
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

    expect(result.students[0]?.growth).toMatchObject({
      equipSpecial: null,
      equipSpecialAvailable: false,
    });
  });

  it("fails closed when the selected skill configuration references the wrong skill type", async () => {
    mockedGetStudentGrowthVisualsBatch.mockResolvedValueOnce(
      new Map([
        [
          "student-a",
          {
            ...growthVisuals,
            skills: growthVisuals.skills.map((skill: { uid: string; skillType: string }) =>
              skill.uid === "skill-ex" ? { ...skill, skillType: "public" } : skill,
            ),
          },
        ],
      ]) as never,
    );

    await expect(getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth")).rejects.toThrow(
      "학생 성장 시각 자료의 스킬 카탈로그를 확인하지 못했어요",
    );
  });

  it("fails closed when a selected skill has no icon URL", async () => {
    mockedGetStudentGrowthVisualsBatch.mockResolvedValueOnce(
      new Map([
        [
          "student-a",
          {
            ...growthVisuals,
            skills: growthVisuals.skills.map((skill) =>
              skill.uid === "skill-enhanced" ? { ...skill, iconUrl: null } : skill,
            ),
          },
        ],
      ]),
    );

    await expect(getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth")).rejects.toThrow(
      "학생 성장 시각 자료의 스킬 카탈로그를 확인하지 못했어요",
    );
  });

  it("fails closed when a stored equipment tier is missing from the shared catalog", async () => {
    mockedGetStudentGrowthEquipmentCatalog.mockResolvedValueOnce([{ uid: "watch-5", category: "watch", tier: 5 }]);

    await expect(getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth")).rejects.toThrow(
      "학생 성장 시각 자료의 장비 티어를 확인하지 못했어요",
    );
  });
});
