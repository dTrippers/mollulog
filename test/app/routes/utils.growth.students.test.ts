import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockIsAuthenticated = jest.fn();
const mockGetActiveSensei = jest.fn();
const mockGetAllStudentsMap = jest.fn();
const mockUpdateRelationshipLevel = jest.fn();
const mockLoadStudentRow = jest.fn();
const mockGetRecruitedStudents = jest.fn();
const mockUpdateRecruitedStudentCurrentState = jest.fn();
const mockUpsertRecruitedStudent = jest.fn();
const mockUpsertStudentGrowth = jest.fn();
const mockValidateStudentGrowthTargetStateForTier = jest.fn();

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: mockGetActiveSensei,
  getAuthenticator: jest.fn(() => ({
    isAuthenticated: mockIsAuthenticated,
  })),
}));

jest.mock("~/models/student", () => ({
  getAllStudentsMap: mockGetAllStudentsMap,
}));

jest.mock("~/models/recruited-student", () => ({
  getRecruitedStudents: mockGetRecruitedStudents,
  updateRecruitedStudentCurrentState: mockUpdateRecruitedStudentCurrentState,
  upsertRecruitedStudent: mockUpsertRecruitedStudent,
}));

jest.mock("~/models/student-growth", () => ({
  removeStudentGrowth: jest.fn(),
  upsertStudentGrowth: mockUpsertStudentGrowth,
  validateStudentGrowthTargetStateForTier: mockValidateStudentGrowthTargetStateForTier,
}));

jest.mock("~/models/relationship-level", () => ({
  updateRelationshipLevel: mockUpdateRelationshipLevel,
}));

jest.mock("../../../app/routes/utils.growth._components/growth-data.server", () => ({
  loadStudentRow: mockLoadStudentRow,
}));

import { action } from "../../../app/routes/utils.growth.students";

const env = { KV_CACHE: { get: jest.fn(async () => null) } } as unknown as Env;

describe("utils.growth.students action", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockIsAuthenticated.mockResolvedValue({ id: 1 } as never);
    mockGetActiveSensei.mockResolvedValue({ id: 1 } as never);
    mockGetAllStudentsMap.mockResolvedValue({
      studentA: {
        uid: "studentA",
        released: true,
        initialTier: 3,
      },
    } as never);
    mockLoadStudentRow.mockResolvedValue({ uid: "studentA" } as never);
    mockGetRecruitedStudents.mockResolvedValue([] as never);
    mockValidateStudentGrowthTargetStateForTier.mockImplementation(() => undefined);
  });

  it("returns the refreshed student row after enrolling a released student", async () => {
    const enrolledRow = {
      uid: "studentA",
      isRecruited: true,
      tier: 3,
    };
    mockLoadStudentRow.mockResolvedValue(enrolledRow as never);

    const response = await action({
      context: { cloudflare: { env } },
      request: new Request("http://localhost/utils/growth/students", {
        method: "POST",
        body: JSON.stringify({
          _intent: "enroll",
          studentUid: "studentA",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    } as never);

    expect(mockUpsertRecruitedStudent).toHaveBeenCalledWith(env, 1, "studentA", 3);
    expect(response).toMatchObject({ data: { kind: "studentUpdate", student: enrolledRow } });
  });

  it("preserves saved relationship items when updating ranks from growth planner", async () => {
    await action({
      context: { cloudflare: { env } },
      request: new Request("http://localhost/utils/growth/students", {
        method: "POST",
        body: JSON.stringify({
          _intent: "relationship",
          studentUid: "studentA",
          currentLevel: 10,
          targetLevel: 30,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    } as never);

    expect(mockUpdateRelationshipLevel).toHaveBeenCalledWith(env, 1, "studentA", {
      currentLevel: 10,
      targetLevel: 30,
    });
  });

  it("passes empty relationship ranks to the atomic model operation for deletion", async () => {
    await action({
      context: { cloudflare: { env } },
      request: new Request("http://localhost/utils/growth/students", {
        method: "POST",
        body: JSON.stringify({
          _intent: "relationship",
          studentUid: "studentA",
          currentLevel: "",
          targetLevel: "",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    } as never);

    expect(mockUpdateRelationshipLevel).toHaveBeenCalledWith(env, 1, "studentA", {
      currentLevel: null,
      targetLevel: null,
    });
  });

  it("refreshes resource requirements without writing student state", async () => {
    await action({
      context: { cloudflare: { env } },
      request: new Request("http://localhost/utils/growth/students", {
        method: "POST",
        body: JSON.stringify({
          _intent: "resourceRequirements",
          studentUid: "studentA",
          _submissionId: "studentA:resource:1",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    } as never);

    expect(mockUpdateRecruitedStudentCurrentState).not.toHaveBeenCalled();
    expect(mockUpsertStudentGrowth).not.toHaveBeenCalled();
    expect(mockLoadStudentRow).toHaveBeenCalledWith(
      env,
      1,
      "studentA",
      expect.objectContaining({ includeResourceRequirements: true }),
    );
  });

  it("writes current growth state only when the student is recruited", async () => {
    mockGetRecruitedStudents.mockResolvedValue([{ studentUid: "studentA" }] as never);

    await action({
      context: { cloudflare: { env } },
      request: new Request("http://localhost/utils/growth/students", {
        method: "POST",
        body: JSON.stringify({
          studentUid: "studentA",
          level: 80,
          skillEx: 4,
          skillNormal: 7,
          skillEnhanced: 8,
          skillSub: 9,
          equip1: 6,
          equip2: 7,
          equip3: 8,
          equipSpecial: 2,
          targetLevel: 90,
          targetSkillEx: 5,
          targetSkillNormal: 10,
          targetSkillEnhanced: 10,
          targetSkillSub: 10,
          targetEquip1: 10,
          targetEquip2: 10,
          targetEquip3: 10,
          targetEquipSpecial: 2,
          targetTier: 5,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    } as never);

    expect(mockUpdateRecruitedStudentCurrentState).toHaveBeenCalledWith(env, 1, "studentA", {
      level: 80,
      weaponLevel: null,
      abilityHp: null,
      abilityAtk: null,
      abilityHeal: null,
      skillEx: 4,
      skillNormal: 7,
      skillEnhanced: 8,
      skillSub: 9,
      equip1: 6,
      equip2: 7,
      equip3: 8,
      equipSpecial: 2,
    });
    expect(mockUpsertStudentGrowth).toHaveBeenCalledWith(env, 1, "studentA", {
      targetLevel: 90,
      targetWeaponLevel: null,
      targetAbilityHp: null,
      targetAbilityAtk: null,
      targetAbilityHeal: null,
      targetSkillEx: 5,
      targetSkillNormal: 10,
      targetSkillEnhanced: 10,
      targetSkillSub: 10,
      targetEquip1: 10,
      targetEquip2: 10,
      targetEquip3: 10,
      targetEquipSpecial: 2,
      targetTier: 5,
    });
  });

  it("does not write current growth state for a non-recruited student", async () => {
    await action({
      context: { cloudflare: { env } },
      request: new Request("http://localhost/utils/growth/students", {
        method: "POST",
        body: JSON.stringify({
          studentUid: "studentA",
          level: 80,
          targetLevel: 90,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    } as never);

    expect(mockUpdateRecruitedStudentCurrentState).not.toHaveBeenCalled();
    expect(mockValidateStudentGrowthTargetStateForTier).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLevel: 90,
        targetTier: null,
      }),
      3,
    );
    expect(mockUpsertStudentGrowth).toHaveBeenCalledWith(env, 1, "studentA", {
      targetLevel: 90,
      targetWeaponLevel: null,
      targetAbilityHp: null,
      targetAbilityAtk: null,
      targetAbilityHeal: null,
      targetSkillEx: null,
      targetSkillNormal: null,
      targetSkillEnhanced: null,
      targetSkillSub: null,
      targetEquip1: null,
      targetEquip2: null,
      targetEquip3: null,
      targetEquipSpecial: null,
      targetTier: null,
    });
  });

  it("does not write growth targets when the effective tier validation fails", async () => {
    mockValidateStudentGrowthTargetStateForTier.mockImplementation(() => {
      throw new Error("목표 고유무기 레벨은(는) 현재 성급 기준 0부터 0 사이만 입력할 수 있어요");
    });

    const response = await action({
      context: { cloudflare: { env } },
      request: new Request("http://localhost/utils/growth/students", {
        method: "POST",
        body: JSON.stringify({
          studentUid: "studentA",
          targetWeaponLevel: 30,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    } as never);

    expect(response).toMatchObject({
      data: {
        error: "목표 고유무기 레벨은(는) 현재 성급 기준 0부터 0 사이만 입력할 수 있어요",
      },
      init: { status: 400 },
    });
    expect(mockUpdateRecruitedStudentCurrentState).not.toHaveBeenCalled();
    expect(mockUpsertStudentGrowth).not.toHaveBeenCalled();
  });
});
