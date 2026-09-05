import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Attack, Defense } from "~/graphql/graphql";
import { getStudentGearData } from "~/models/growth-resource";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getAllStudents, getStudentWeaponAvailability } from "~/models/student";
import { canViewUserStudentGrowth, getUserStudentsView } from "~/views/user-students.server";

jest.mock("~/models/growth-resource", () => ({
  getStudentGearData: jest.fn(),
}));

jest.mock("~/models/recruited-student", () => ({
  getRecruitedStudents: jest.fn(),
}));

jest.mock("~/models/student", () => ({
  getAllStudents: jest.fn(),
  getStudentWeaponAvailability: jest.fn(),
}));

const env = {} as Env;
const mockedGetStudentGearData = getStudentGearData as jest.MockedFunction<typeof getStudentGearData>;
const mockedGetRecruitedStudents = getRecruitedStudents as jest.MockedFunction<typeof getRecruitedStudents>;
const mockedGetAllStudents = getAllStudents as jest.MockedFunction<typeof getAllStudents>;
const mockedGetStudentWeaponAvailability = getStudentWeaponAvailability as jest.MockedFunction<
  typeof getStudentWeaponAvailability
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

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetRecruitedStudents.mockResolvedValue([recruitedStudent]);
  mockedGetAllStudents.mockResolvedValue([student]);
  mockedGetStudentGearData.mockResolvedValue(new Map([["student-a", { name: "애용품", growthItems: [] }]]));
  mockedGetStudentWeaponAvailability.mockResolvedValue(new Map([["student-a", true]]));
});

describe("user students view", () => {
  it("keeps growth state private and avoids growth-resource calls in summary mode", async () => {
    const result = await getUserStudentsView(env, sensei, 2, "growth");

    expect(result.view).toBe("summary");
    expect(result.canViewGrowth).toBe(false);
    expect(result.students[0]?.growth).toBeUndefined();
    expect(mockedGetStudentGearData).not.toHaveBeenCalled();
  });

  it("projects only applicable public growth fields and hides stored levels and weapon state", async () => {
    const result = await getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth");

    expect(result.view).toBe("growth");
    expect(mockedGetStudentGearData).toHaveBeenCalledTimes(1);
    expect(mockedGetStudentGearData).toHaveBeenCalledWith(env, ["student-a"]);
    expect(result.students[0]).toMatchObject({
      uid: "student-a",
      tier: 6,
      growth: {
        level: 80,
        skillEx: 5,
        equip1: 7,
        equip2: null,
        equip3: 5,
        equipSpecial: 2,
        equipSpecialAvailable: true,
        equipmentAvailable: [true, false, true],
        abilityHp: 10,
        abilityAtk: 11,
        abilityHeal: 12,
        abilityAvailable: true,
        abilityCatalogAvailable: true,
      },
    });
    expect(result.students[0]?.growth).not.toHaveProperty("weaponLevel");
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
    expect(mockedGetStudentGearData).toHaveBeenCalledTimes(expected ? 1 : 0);
    expect(mockedGetStudentWeaponAvailability).toHaveBeenCalledTimes(expected ? 1 : 0);
  });

  it("fails closed when a recruited student is omitted from the weapon catalog response", async () => {
    mockedGetStudentWeaponAvailability.mockResolvedValueOnce(new Map());

    await expect(getUserStudentsView(env, { ...sensei, growthVisibility: true }, 2, "growth")).rejects.toThrow(
      "학생 고유무기 정보를 확인하지 못했어요",
    );
    expect(mockedGetStudentWeaponAvailability).toHaveBeenCalledTimes(1);
  });
});
