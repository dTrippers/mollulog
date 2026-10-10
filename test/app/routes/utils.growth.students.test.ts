import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockIsAuthenticated = jest.fn();
const mockGetActiveSensei = jest.fn();
const mockGetAllStudentsMap = jest.fn();
const mockUpdateRelationshipLevel = jest.fn();
const mockLoadStudentRow = jest.fn();
const mockUpsertRecruitedStudent = jest.fn();
const mockUpdateRecruitedStudentTier = jest.fn();
const mockUpsertStudentGrowth = jest.fn();
const mockSaveStudentGrowthAndCurrentState = jest.fn<(...args: unknown[]) => Promise<unknown>>();

class RecruitedStudentValidationError extends Error {}
class StudentGrowthValidationError extends Error {}

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
  RecruitedStudentValidationError,
  updateRecruitedStudentTier: mockUpdateRecruitedStudentTier,
  upsertRecruitedStudent: mockUpsertRecruitedStudent,
}));

jest.mock("~/models/student-growth", () => ({
  removeStudentGrowth: jest.fn(),
  StudentGrowthValidationError,
  saveStudentGrowthAndCurrentState: mockSaveStudentGrowthAndCurrentState,
  upsertStudentGrowth: mockUpsertStudentGrowth,
}));

jest.mock("~/models/relationship-level", () => ({
  updateRelationshipLevel: mockUpdateRelationshipLevel,
}));

jest.mock("../../../app/routes/utils.growth._components/growth-data.server", () => ({
  loadStudentRow: mockLoadStudentRow,
}));

import { StaleStudentStateRequestError } from "~/domain/student-state-errors";
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
    mockSaveStudentGrowthAndCurrentState.mockResolvedValue(undefined as never);
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

    expect(mockUpdateRelationshipLevel).toHaveBeenCalledWith(
      env,
      1,
      "studentA",
      {
        currentLevel: 10,
        targetLevel: 30,
      },
      "legacy",
    );
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

    expect(mockUpdateRelationshipLevel).toHaveBeenCalledWith(
      env,
      1,
      "studentA",
      {
        currentLevel: null,
        targetLevel: null,
      },
      "legacy",
    );
  });

  it("rejects a legacy target below current before calling the model", async () => {
    const response = await action({
      context: { cloudflare: { env } },
      request: new Request("http://localhost/utils/growth/students", {
        method: "POST",
        body: JSON.stringify({
          _intent: "relationship",
          studentUid: "studentA",
          currentLevel: 20,
          targetLevel: 10,
        }),
        headers: { "Content-Type": "application/json" },
      }),
    } as never);

    expect(response).toMatchObject({
      data: { error: "목표 인연 랭크는 현재 인연 랭크보다 낮을 수 없어요" },
      init: { status: 400 },
    });
    expect(mockUpdateRelationshipLevel).not.toHaveBeenCalled();
  });

  it("allows a nullable target below current through the route validation", async () => {
    const response = await action({
      context: { cloudflare: { env } },
      request: new Request("http://localhost/utils/growth/students", {
        method: "POST",
        body: JSON.stringify({
          _intent: "relationship",
          studentUid: "studentA",
          currentLevel: 20,
          targetLevel: 10,
          stateFormat: "nullable",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    } as never);

    expect(response).toMatchObject({ data: { kind: "studentUpdate" } });
    expect(mockUpdateRelationshipLevel).toHaveBeenCalledWith(
      env,
      1,
      "studentA",
      { currentLevel: 20, targetLevel: 10 },
      "nullable",
    );
  });

  it("keeps missing nullable relationship ranks as null in the planner request", async () => {
    await action({
      context: { cloudflare: { env } },
      request: new Request("http://localhost/utils/growth/students", {
        method: "POST",
        body: JSON.stringify({
          _intent: "relationship",
          studentUid: "studentA",
          currentLevel: "",
          targetLevel: "",
          stateFormat: "nullable",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    } as never);

    expect(mockUpdateRelationshipLevel).toHaveBeenCalledWith(
      env,
      1,
      "studentA",
      { currentLevel: null, targetLevel: null },
      "nullable",
    );
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

    expect(mockSaveStudentGrowthAndCurrentState).not.toHaveBeenCalled();
    expect(mockUpsertStudentGrowth).not.toHaveBeenCalled();
    expect(mockLoadStudentRow).toHaveBeenCalledWith(
      env,
      1,
      "studentA",
      expect.objectContaining({ includeResourceRequirements: true }),
    );
  });

  it("saves current growth state and targets in one atomic model operation", async () => {
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

    expect(mockSaveStudentGrowthAndCurrentState).toHaveBeenCalledWith(
      env,
      1,
      "studentA",
      {
        level: 80,
        skillEx: 4,
        skillNormal: 7,
        skillEnhanced: 8,
        skillSub: 9,
        equip1: 6,
        equip2: 7,
        equip3: 8,
        equipSpecial: 2,
      },
      {
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
      },
      3,
      "legacy",
    );
    expect(mockUpsertStudentGrowth).not.toHaveBeenCalled();
  });

  it("delegates current-state presence to the lock-scoped model", async () => {
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

    expect(mockSaveStudentGrowthAndCurrentState).toHaveBeenCalledWith(
      env,
      1,
      "studentA",
      {
        level: 80,
      },
      {
        targetLevel: 90,
      },
      3,
      "legacy",
    );
    expect(mockUpsertStudentGrowth).not.toHaveBeenCalled();
  });

  it("returns a field validation error from the atomic model without exposing an internal error", async () => {
    mockSaveStudentGrowthAndCurrentState.mockRejectedValueOnce(
      new StudentGrowthValidationError("목표 고유무기 레벨은(는) 현재 성급 기준 0부터 0 사이만 입력할 수 있어요"),
    );

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
    expect(mockUpsertStudentGrowth).not.toHaveBeenCalled();
  });

  it("returns the typed stale response as a 409", async () => {
    mockSaveStudentGrowthAndCurrentState.mockRejectedValueOnce(new StaleStudentStateRequestError());

    const response = await action({
      context: { cloudflare: { env } },
      request: new Request("http://localhost/utils/growth/students", {
        method: "POST",
        body: JSON.stringify({ studentUid: "studentA", level: 80 }),
        headers: { "Content-Type": "application/json" },
      }),
    } as never);

    expect(response).toMatchObject({
      data: {
        code: "STUDENT_STATE_STALE",
        error: "페이지가 최신 상태가 아니라 저장하지 못했어요. 새로고침 후 다시 입력해 주세요.",
      },
      init: { status: 409 },
    });
  });
});
