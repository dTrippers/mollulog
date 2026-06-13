import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockIsAuthenticated = jest.fn();
const mockGetActiveSensei = jest.fn();
const mockGetAllStudentsMap = jest.fn();
const mockGetRelationshipLevel = jest.fn();
const mockResolveRelationshipLevelInput = jest.fn();
const mockUpsertRelationshipLevel = jest.fn();
const mockLoadStudentRow = jest.fn();
const mockGetRecruitedStudents = jest.fn();
const mockUpdateRecruitedStudentCurrentState = jest.fn();
const mockUpsertRecruitedStudent = jest.fn();
const mockUpsertStudentGrowth = jest.fn();

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
}));

jest.mock("~/models/relationship-level", () => ({
  getRelationshipLevel: mockGetRelationshipLevel,
  removeRelationshipLevel: jest.fn(),
  resolveRelationshipLevelInput: mockResolveRelationshipLevelInput,
  upsertRelationshipLevel: mockUpsertRelationshipLevel,
}));

jest.mock("../../../app/routes/utils.growth._components/growth-data.server", () => ({
  loadStudentRow: mockLoadStudentRow,
}));

import { action } from "../../../app/routes/utils.growth.students";

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
  });

  it("returns the refreshed student row after enrolling a released student", async () => {
    const enrolledRow = {
      uid: "studentA",
      isRecruited: true,
      tier: 3,
    };
    mockLoadStudentRow.mockResolvedValue(enrolledRow as never);

    const response = await action({
      context: { cloudflare: { env: {} } },
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

    expect(mockUpsertRecruitedStudent).toHaveBeenCalledWith({}, 1, "studentA", 3);
    expect(response).toMatchObject({ data: { kind: "studentUpdate", student: enrolledRow } });
  });

  it("preserves saved relationship items when updating ranks from growth planner", async () => {
    mockGetRelationshipLevel.mockResolvedValue({
      uid: "relationship-1",
      studentId: "studentA",
      currentLevel: 10,
      currentExp: 123,
      targetLevel: 20,
      items: { gift1: 5, gift2: 2 },
    } as never);
    mockResolveRelationshipLevelInput.mockReturnValue({
      currentLevel: 10,
      currentExp: 123,
      targetLevel: 30,
    });

    await action({
      context: { cloudflare: { env: {} } },
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

    expect(mockUpsertRelationshipLevel).toHaveBeenCalledWith({}, 1, "studentA", 10, 123, 30, { gift1: 5, gift2: 2 });
  });

  it("initializes relationship items to an empty object when no saved row exists", async () => {
    mockGetRelationshipLevel.mockResolvedValue(null as never);
    mockResolveRelationshipLevelInput.mockReturnValue({
      currentLevel: 1,
      currentExp: null,
      targetLevel: 15,
    });

    await action({
      context: { cloudflare: { env: {} } },
      request: new Request("http://localhost/utils/growth/students", {
        method: "POST",
        body: JSON.stringify({
          _intent: "relationship",
          studentUid: "studentA",
          currentLevel: 1,
          targetLevel: 15,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    } as never);

    expect(mockUpsertRelationshipLevel).toHaveBeenCalledWith({}, 1, "studentA", 1, null, 15, {});
  });

  it("writes current growth state only when the student is recruited", async () => {
    mockGetRecruitedStudents.mockResolvedValue([{ studentUid: "studentA" }] as never);

    await action({
      context: { cloudflare: { env: {} } },
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

    expect(mockUpdateRecruitedStudentCurrentState).toHaveBeenCalledWith({}, 1, "studentA", {
      level: 80,
      skillEx: 4,
      skillNormal: 7,
      skillEnhanced: 8,
      skillSub: 9,
      equip1: 6,
      equip2: 7,
      equip3: 8,
      equipSpecial: 2,
    });
    expect(mockUpsertStudentGrowth).toHaveBeenCalledWith({}, 1, "studentA", {
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
    });
  });

  it("does not write current growth state for a non-recruited student", async () => {
    await action({
      context: { cloudflare: { env: {} } },
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
    expect(mockUpsertStudentGrowth).toHaveBeenCalledWith({}, 1, "studentA", {
      targetLevel: 90,
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
});
