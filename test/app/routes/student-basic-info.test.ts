import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { RecruitedStudentCurrentStateInput } from "~/models/recruited-student";

const mockGetActiveSensei = jest.fn<(env: Env, request: Request) => Promise<{ id: number } | null>>();
const mockGetStudentDetailData = jest.fn<(env: Env, uid: string) => Promise<unknown>>();
const mockGetRecruitedStudents = jest.fn<(env: Env, senseiId: number) => Promise<unknown[]>>();
const mockSaveStudentBasicInfo =
  jest.fn<
    (
      env: Env,
      senseiId: number,
      studentUid: string,
      input: {
        tier: number;
        currentState: RecruitedStudentCurrentStateInput;
        relationshipBonds: Record<string, number>;
      },
    ) => Promise<void>
  >();
const mockGetRelationshipLevels =
  jest.fn<
    (
      env: Env,
      senseiId: number,
      studentIds: readonly string[],
    ) => Promise<
      Array<{
        studentId: string;
        targetLevel: number;
        currentLevel: number;
        currentExp: number | null;
        items: Record<string, number>;
      }>
    >
  >();
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: mockGetActiveSensei,
}));

jest.mock("~/models/student", () => ({
  getStudentDetailData: mockGetStudentDetailData,
}));

jest.mock("~/models/recruited-student", () => ({
  getRecruitedStudents: mockGetRecruitedStudents,
}));

jest.mock("~/models/relationship-level", () => ({
  getRelationshipLevels: mockGetRelationshipLevels,
}));

jest.mock("~/models/student-basic-info", () => ({
  saveStudentBasicInfo: mockSaveStudentBasicInfo,
}));

jest.mock("~/lib/observability.server", () => ({
  getLogger: () => logger,
}));

import { StudentSkillSelectionCondition } from "~/graphql/graphql";
import {
  getAbilityReleaseDisabledReason,
  getSkillSelectionConditionLabel,
} from "~/routes/students.$id._components/StudentBasicInfo";
import { action, toStudentBasicInfoCurrentStateInput } from "~/routes/students.$id._index";

const env = {} as Env;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 1 });
  mockGetStudentDetailData.mockResolvedValue({
    studentCatalog: {
      equipment: [
        { category: "hat", tier: 1, maxLevel: 10 },
        { category: "bag", tier: 1, maxLevel: 20 },
        { category: "shoes", tier: 1, maxLevel: 30 },
      ],
    },
    student: {
      uid: "student-a",
      released: true,
      initialTier: 3,
      equipments: ["hat", "bag", "shoes"],
      studentVariant: { primaryStudent: { uid: "student-a" } },
      character: { studentVariants: [{ primaryStudent: { uid: "student-a" } }] },
    },
  });
  mockGetRelationshipLevels.mockResolvedValue([]);
  mockSaveStudentBasicInfo.mockResolvedValue(undefined);
});

describe("student basic info ability release", () => {
  it("prioritizes the weapon tier requirement", () => {
    expect(getAbilityReleaseDisabledReason(5)).toBe("고유무기 1성부터 능력 개방을 설정할 수 있어요");
  });

  it("enables every ability release stat after equipping the unique weapon", () => {
    expect(getAbilityReleaseDisabledReason(6)).toBeNull();
  });

  it("preserves omitted equipment levels while retaining explicit null", () => {
    const withoutEquipmentLevels = toStudentBasicInfoCurrentStateInput({ level: 80 });
    const withExplicitNull = toStudentBasicInfoCurrentStateInput({ level: 80, equip1Level: null });

    expect(withoutEquipmentLevels).not.toHaveProperty("equip1Level");
    expect(withoutEquipmentLevels).not.toHaveProperty("equip2Level");
    expect(withoutEquipmentLevels).not.toHaveProperty("equip3Level");
    expect(withExplicitNull).toHaveProperty("equip1Level", null);
  });
});

describe("student basic info equipment-level action", () => {
  it("rejects an equipment level above the selected catalog maximum before persistence", async () => {
    const response = await action({
      params: { id: "student-a" },
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.test/students/student-a", {
        method: "POST",
        body: JSON.stringify({ tier: 3, equip1: 1, equip1Level: 70 }),
        headers: { "Content-Type": "application/json" },
      }),
    } as never);

    expect(response).toMatchObject({
      data: { ok: false, error: "장비 1 레벨은(는) 1부터 10 사이만 입력할 수 있어요" },
      init: { status: 400 },
    });
    expect(mockSaveStudentBasicInfo).not.toHaveBeenCalled();
  });

  it("rejects an equipment level when the selected catalog equipment is missing", async () => {
    mockGetStudentDetailData.mockResolvedValueOnce({
      studentCatalog: { equipment: [] },
      student: {
        uid: "student-a",
        released: true,
        initialTier: 3,
        equipments: ["hat"],
        studentVariant: { primaryStudent: { uid: "student-a" } },
        character: { studentVariants: [{ primaryStudent: { uid: "student-a" } }] },
      },
    });

    const response = await action({
      params: { id: "student-a" },
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.test/students/student-a", {
        method: "POST",
        body: JSON.stringify({ tier: 3, equip1: 1, equip1Level: 1 }),
        headers: { "Content-Type": "application/json" },
      }),
    } as never);

    expect(response).toMatchObject({
      data: { ok: false, error: "장비 1 정보를 확인하지 못했어요" },
      init: { status: 400 },
    });
    expect(mockSaveStudentBasicInfo).not.toHaveBeenCalled();
  });

  it("accepts an equipment level at the selected catalog maximum", async () => {
    const response = await action({
      params: { id: "student-a" },
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.test/students/student-a", {
        method: "POST",
        body: JSON.stringify({ tier: 3, equip1: 1, equip1Level: 10 }),
        headers: { "Content-Type": "application/json" },
      }),
    } as never);

    expect(response).toMatchObject({ data: { ok: true } });
    expect(mockSaveStudentBasicInfo).toHaveBeenCalledWith(
      env,
      1,
      "student-a",
      expect.objectContaining({
        tier: 3,
        currentState: expect.objectContaining({ equip1Level: 10 }),
        relationshipBonds: {},
      }),
    );
  });

  it("returns a safe retryable 500 and logs unexpected save failures", async () => {
    const internalError = new Error("SQL timeout; password=secret");
    mockSaveStudentBasicInfo.mockRejectedValueOnce(internalError);

    const response = await action({
      params: { id: "student-a" },
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.test/students/student-a", {
        method: "POST",
        body: JSON.stringify({ tier: 3, equip1: 1, equip1Level: 10 }),
        headers: { "Content-Type": "application/json" },
      }),
    } as never);

    expect(response).toMatchObject({
      data: { ok: false, error: "육성 상태를 저장하지 못했어요. 잠시 후 다시 시도해주세요" },
      init: { status: 500 },
    });
    expect(JSON.stringify(response)).not.toContain("password=secret");
    expect(logger.error).toHaveBeenCalledWith(
      "Student basic info save failed",
      internalError,
      expect.objectContaining({ operation: "save", studentUid: "student-a", userId: 1 }),
    );
  });
});

describe("student skill selection condition", () => {
  it.each([
    [StudentSkillSelectionCondition.Enemy, "적에게 사용 시"],
    [StudentSkillSelectionCondition.Self, "자신에게 사용 시"],
  ])("translates %s into an in-game style label", (condition, expected) => {
    expect(getSkillSelectionConditionLabel(condition)).toBe(expected);
  });
});
