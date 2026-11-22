import { describe, expect, it, jest } from "@jest/globals";
import { Attack, Defense } from "~/graphql/graphql";
import type { RecruitedStudent } from "~/models/recruited-student";
import type { RelationshipLevel } from "~/models/relationship-level";
import type { StudentDirectoryStudent } from "~/models/student-directory";
import { loadStudentDirectoryPersonalState, type StudentDirectoryPersonalSources } from "~/views/student-directory";

const env = {} as Env;

function student(uid: string, primaryUid: string | null): StudentDirectoryStudent {
  return {
    uid,
    name: uid,
    familyName: null,
    altNames: [],
    school: "millennium",
    initialTier: 3,
    order: 1,
    releaseAt: null,
    attackType: Attack.Explosive,
    defenseType: Defense.Light,
    weaponType: "ar",
    acquisitionType: "regular",
    canUseCover: true,
    skillEffectTags: [],
    club: null,
    studentVariant: primaryUid ? { primaryStudent: { uid: primaryUid } } : null,
    position: "front",
    tacticRole: "attacker",
    birthday: "2000-01-01",
    role: "striker",
    equipments: ["hat", "bag", "shoes"],
    released: true,
    catalog: null,
  };
}

function recruitedStudent(studentUid: string): RecruitedStudent {
  return {
    uid: `recruited-${studentUid}`,
    studentUid,
    tier: 7,
    level: 90,
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
}

function relationshipLevel(studentId: string): RelationshipLevel {
  return {
    uid: `relationship-${studentId}`,
    studentId,
    currentLevel: 30,
    currentExp: null,
    targetLevel: 30,
    items: {},
  };
}

describe("student directory personal view state", () => {
  it("returns signed-out without querying private records", async () => {
    const getRecruitedStudents = jest.fn<StudentDirectoryPersonalSources["getRecruitedStudents"]>();
    const getRelationshipLevels = jest.fn<StudentDirectoryPersonalSources["getRelationshipLevels"]>();
    const result = await loadStudentDirectoryPersonalState(env, null, [student("student", "primary")], {
      getRecruitedStudents,
      getRelationshipLevels,
    });

    expect(result).toEqual({ state: { status: "signed-out" } });
    expect(getRecruitedStudents).not.toHaveBeenCalled();
    expect(getRelationshipLevels).not.toHaveBeenCalled();
  });

  it("joins recruitment and bond records by the deduplicated primary student uid", async () => {
    const getRecruitedStudents = jest
      .fn<StudentDirectoryPersonalSources["getRecruitedStudents"]>()
      .mockResolvedValue([recruitedStudent("primary")]);
    const getRelationshipLevels = jest
      .fn<StudentDirectoryPersonalSources["getRelationshipLevels"]>()
      .mockResolvedValue([relationshipLevel("primary")]);
    const result = await loadStudentDirectoryPersonalState(
      env,
      9,
      [student("variant-a", "primary"), student("variant-b", "primary"), student("base", null)],
      { getRecruitedStudents, getRelationshipLevels },
    );

    expect(getRecruitedStudents).toHaveBeenCalledWith(env, 9, ["primary"]);
    expect(getRelationshipLevels).toHaveBeenCalledWith(env, 9, ["primary"]);
    expect(result.state).toEqual({
      status: "loaded",
      byPrimaryUid: {
        primary: { status: "recruited", tier: 7, level: 90, bondLevel: 30 },
      },
    });
  });

  it("marks missing recruited rows as unrecruited only after successful reads", async () => {
    const sources = {
      getRecruitedStudents: jest.fn<StudentDirectoryPersonalSources["getRecruitedStudents"]>().mockResolvedValue([]),
      getRelationshipLevels: jest.fn<StudentDirectoryPersonalSources["getRelationshipLevels"]>().mockResolvedValue([]),
    } satisfies StudentDirectoryPersonalSources;

    const result = await loadStudentDirectoryPersonalState(env, 9, [student("student", "primary")], sources);

    expect(result.state).toEqual({
      status: "loaded",
      byPrimaryUid: { primary: { status: "unrecruited", tier: null, level: null, bondLevel: null } },
    });
  });

  it("returns failed without converting rejected reads into unrecruited records", async () => {
    const failure = new Error("database unavailable");
    const sources = {
      getRecruitedStudents: jest
        .fn<StudentDirectoryPersonalSources["getRecruitedStudents"]>()
        .mockRejectedValue(failure),
      getRelationshipLevels: jest.fn<StudentDirectoryPersonalSources["getRelationshipLevels"]>().mockResolvedValue([]),
    } satisfies StudentDirectoryPersonalSources;

    const result = await loadStudentDirectoryPersonalState(env, 9, [student("student", "primary")], sources);

    expect(result).toEqual({ state: { status: "failed" }, error: failure });
  });
});
