import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { createStudentFilterState } from "~/components/features/students/StudentFilter";
import { serializeStudentFilterStateCookie } from "~/components/features/students/student-filter-cookie";
import { Attack, Defense } from "~/graphql/graphql";
import { captureServerError, getLogger } from "~/lib/observability.server";
import {
  addRecruitedStudents,
  getRecruitedStudents,
  patchRecruitedStudentCurrentState,
  RecruitedStudentValidationError,
  removeRecruitedStudent,
  upsertRecruitedStudent,
} from "~/models/recruited-student";
import { updateSensei } from "~/models/sensei";
import { getAllStudents, getAllStudentsMap, getStudentDetailData } from "~/models/student";
import { getRouteSensei } from "~/routes/$username._components/route-sensei.server";
import {
  action,
  loader,
  resolveGrowthVisibility,
  USER_STUDENT_FILTER_COOKIE_NAME,
  USER_STUDENT_FILTER_SORTS,
} from "~/routes/$username.students";

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/lib/observability.server", () => ({
  captureServerError: jest.fn(),
  getLogger: jest.fn(),
}));

jest.mock("~/routes/$username._components/route-sensei.server", () => ({
  getRouteSensei: jest.fn(),
}));

jest.mock("~/models/recruited-student", () => ({
  getRecruitedStudents: jest.fn(),
  MAX_RECRUITED_STUDENT_BATCH_SIZE: 500,
  removeRecruitedStudent: jest.fn(),
  upsertRecruitedStudent: jest.fn(),
  addRecruitedStudents: jest.fn(),
  patchRecruitedStudentCurrentState: jest.fn(),
  RecruitedStudentValidationError: class RecruitedStudentValidationError extends Error {},
}));

jest.mock("~/models/student", () => ({
  getAllStudents: jest.fn(),
  getAllStudentsMap: jest.fn(),
  getStudentDetailData: jest.fn(),
  getStudentWeaponAvailability: jest.fn(),
}));

jest.mock("~/models/sensei", () => ({
  updateSensei: jest.fn(),
}));

jest.mock("~/components/features/students", () => ({
  getFilteredStudentUids: jest.fn(),
  StudentCards: jest.fn(() => null),
  StudentFilter: jest.fn(() => null),
  TierSelector: jest.fn(() => null),
  usePersistentStudentFilterState: jest.fn(() => [
    {
      attackTypes: [],
      defenseTypes: [],
      roles: [],
      tacticRoles: [],
      positions: [],
      sort: "recent",
    },
    jest.fn(),
  ]),
}));

jest.mock("~/components/primitives", () => ({
  Button: jest.fn(() => null),
  SubTitle: jest.fn(() => null),
  Toggle: jest.fn(() => null),
}));

const env = { HYPERDRIVE: { connectionString: "postgres://test" } } as unknown as Env;
const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedCaptureServerError = captureServerError as jest.MockedFunction<typeof captureServerError>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedGetRouteSensei = getRouteSensei as jest.MockedFunction<typeof getRouteSensei>;
const mockedGetRecruitedStudents = getRecruitedStudents as jest.MockedFunction<typeof getRecruitedStudents>;
const mockedGetAllStudents = getAllStudents as jest.MockedFunction<typeof getAllStudents>;
const mockedGetAllStudentsMap = getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>;
const mockedRemoveRecruitedStudent = removeRecruitedStudent as jest.MockedFunction<typeof removeRecruitedStudent>;
const mockedUpsertRecruitedStudent = upsertRecruitedStudent as jest.MockedFunction<typeof upsertRecruitedStudent>;
const mockedAddRecruitedStudents = addRecruitedStudents as jest.MockedFunction<typeof addRecruitedStudents>;
const mockedPatchRecruitedStudentCurrentState = patchRecruitedStudentCurrentState as jest.MockedFunction<
  typeof patchRecruitedStudentCurrentState
>;
const mockedGetStudentDetailData = getStudentDetailData as jest.MockedFunction<typeof getStudentDetailData>;
const mockedUpdateSensei = updateSensei as jest.MockedFunction<typeof updateSensei>;
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

function createActionArgs(formData: FormData, method = "POST") {
  return {
    context: { cloudflare: { env, ctx: {} as ExecutionContext } },
    request: new Request("https://mollulog.test/@sensei/students", { method, body: formData }),
    params: { username: "@sensei" },
  } as never;
}

function createLoaderArgs(cookie?: string) {
  return {
    context: { cloudflare: { env, ctx: {} as ExecutionContext } },
    request: new Request("https://mollulog.test/@sensei/students", {
      headers: cookie ? { Cookie: cookie } : undefined,
    }),
    params: { username: "@sensei" },
  } as never;
}

function expectDataResult<T>(result: unknown): { data: T; init: ResponseInit | null } {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as { data: T; init: ResponseInit | null };
}

function batchFormData(entries: Array<[string, number]> = []) {
  const formData = new FormData();
  formData.append("intent", "batch-add");
  for (const [studentUid, tier] of entries) {
    formData.append("studentUids", studentUid);
    formData.append("tiers", tier.toString());
  }
  return formData;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetLogger.mockReturnValue(logger);
  mockedGetActiveSensei.mockResolvedValue({ id: 1, uid: "sensei-1", username: "sensei" } as Awaited<
    ReturnType<typeof getActiveSensei>
  >);
  mockedGetRouteSensei.mockResolvedValue({ id: 1, uid: "sensei-1", username: "sensei" } as Awaited<
    ReturnType<typeof getRouteSensei>
  >);
  mockedGetRecruitedStudents.mockResolvedValue([]);
  mockedGetAllStudents.mockResolvedValue([]);
  mockedGetAllStudentsMap.mockResolvedValue({
    "student-a": { uid: "student-a", released: true, initialTier: 3 },
    "student-b": { uid: "student-b", released: true, initialTier: 5 },
  } as unknown as Awaited<ReturnType<typeof getAllStudentsMap>>);
  mockedRemoveRecruitedStudent.mockResolvedValue(undefined);
  mockedUpsertRecruitedStudent.mockResolvedValue(undefined);
  mockedAddRecruitedStudents.mockResolvedValue(undefined);
  mockedPatchRecruitedStudentCurrentState.mockResolvedValue({} as never);
  mockedGetStudentDetailData.mockResolvedValue(undefined);
  mockedUpdateSensei.mockResolvedValue({});
});

describe("@username students loader", () => {
  it("uses loader visibility after a fetcher request settles even when its response is retained", () => {
    expect(resolveGrowthVisibility(true, "idle", false)).toBe(true);
    expect(resolveGrowthVisibility(false, "loading", true)).toBe(true);
  });

  it("seeds the first render from the user student filter cookie", async () => {
    const state = {
      ...createStudentFilterState("tier"),
      attackTypes: [Attack.Explosive],
      search: "아루",
    };
    const cookieValue = serializeStudentFilterStateCookie(
      { defaultSort: "recent", allowedSorts: USER_STUDENT_FILTER_SORTS },
      state,
    );
    mockedGetRecruitedStudents.mockResolvedValueOnce([{ studentUid: "student-a", tier: 4 }] as never);
    mockedGetAllStudents.mockResolvedValueOnce([
      {
        uid: "student-a",
        name: "아루",
        attackType: Attack.Explosive,
        defenseType: Defense.Light,
        role: "striker",
        position: "front",
        tacticRole: "attacker",
        order: 1,
        initialTier: 3,
      },
    ] as never);

    const result = await loader(createLoaderArgs(`${USER_STUDENT_FILTER_COOKIE_NAME}=${cookieValue}`));

    expect(result.filterState).toEqual({
      ...createStudentFilterState("tier"),
      attackTypes: [Attack.Explosive],
    });
  });
});

describe("@username students action", () => {
  it("dispatches one batch operation for a selected batch", async () => {
    const response = expectDataResult<{ success: boolean }>(
      await action(
        createActionArgs(
          batchFormData([
            ["student-a", 3],
            ["student-b", 5],
          ]),
        ),
      ),
    );

    expect(response.data).toEqual({ success: true });
    expect(mockedAddRecruitedStudents).toHaveBeenCalledTimes(1);
    expect(mockedAddRecruitedStudents).toHaveBeenCalledWith(env, 1, [
      { studentUid: "student-a", tier: 3 },
      { studentUid: "student-b", tier: 5 },
    ]);
    expect(mockedUpsertRecruitedStudent).not.toHaveBeenCalled();
    expect(mockedGetAllStudentsMap).toHaveBeenCalledTimes(1);
  });

  it("does not call the batch model operation for an empty selection", async () => {
    const response = expectDataResult<{ success: boolean }>(await action(createActionArgs(batchFormData())));

    expect(response.init?.status).toBe(400);
    expect(response.data).toEqual({ error: "등록할 학생을 선택해 주세요" });
    expect(mockedAddRecruitedStudents).not.toHaveBeenCalled();
    expect(mockedGetAllStudentsMap).not.toHaveBeenCalled();
  });

  it.each([
    [
      "mismatched UID and tier fields",
      (() => {
        const formData = batchFormData([["student-a", 3]]);
        formData.append("studentUids", "student-b");
        return formData;
      })(),
    ],
    ["invalid tier", batchFormData([["student-a", 10]])],
  ])("rejects %s without calling the model operation", async (_name, formData) => {
    const response = expectDataResult<{ error: string }>(await action(createActionArgs(formData)));

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("학생 일괄 등록 요청이 올바르지 않아요");
    expect(mockedAddRecruitedStudents).not.toHaveBeenCalled();
    expect(mockedGetAllStudentsMap).not.toHaveBeenCalled();
  });

  it("rejects more than 500 unique students without calling the model operation", async () => {
    const entries = Array.from({ length: 501 }, (_, index) => [`student-${index}`, 3] as [string, number]);

    const response = expectDataResult<{ error: string }>(await action(createActionArgs(batchFormData(entries))));

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("학생 일괄 등록 요청이 올바르지 않아요");
    expect(mockedAddRecruitedStudents).not.toHaveBeenCalled();
  });

  it("rejects an unknown batch UID before writing", async () => {
    const response = expectDataResult<{ error: string }>(
      await action(createActionArgs(batchFormData([["unknown-student", 3]]))),
    );

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("존재하지 않는 학생이에요");
    expect(mockedGetAllStudentsMap).toHaveBeenCalledTimes(1);
    expect(mockedAddRecruitedStudents).not.toHaveBeenCalled();
  });

  it("treats an empty released catalog as an unavailable server dependency", async () => {
    mockedGetAllStudentsMap.mockResolvedValueOnce({});

    const response = expectDataResult<{ error: string }>(
      await action(createActionArgs(batchFormData([["student-a", 3]]))),
    );

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe("학생 목록을 확인하지 못했어요. 잠시 후 다시 시도해 주세요");
    expect(mockedAddRecruitedStudents).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "Recruited student action failed",
      expect.any(Error),
      expect.objectContaining({ route: "username.students.action", operation: "batch-catalog", catalogSize: 0 }),
    );
    expect(mockedCaptureServerError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ route: "username.students.action", operation: "batch-catalog", catalogSize: 0 }),
    );
  });

  it("reports thrown catalog failures before returning a Korean 500", async () => {
    const catalogError = new Error("catalog unavailable");
    mockedGetAllStudentsMap.mockRejectedValueOnce(catalogError);

    const response = expectDataResult<{ error: string }>(
      await action(createActionArgs(batchFormData([["student-a", 3]]))),
    );

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe("학생 목록을 확인하지 못했어요. 잠시 후 다시 시도해 주세요");
    expect(logger.error).toHaveBeenCalledWith(
      "Recruited student action failed",
      catalogError,
      expect.objectContaining({ route: "username.students.action", operation: "batch-catalog" }),
    );
    expect(mockedCaptureServerError).toHaveBeenCalledWith(
      catalogError,
      expect.objectContaining({ route: "username.students.action", operation: "batch-catalog" }),
    );
    expect(mockedAddRecruitedStudents).not.toHaveBeenCalled();
  });

  it("maps expected batch model validation failures to Korean 400 responses", async () => {
    mockedAddRecruitedStudents.mockRejectedValueOnce(new RecruitedStudentValidationError("internal validation"));

    const response = expectDataResult<{ error: string }>(
      await action(createActionArgs(batchFormData([["student-a", 3]]))),
    );

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("학생 일괄 등록 요청이 올바르지 않아요");
  });

  it("maps unexpected batch write failures to Korean 500 responses", async () => {
    mockedAddRecruitedStudents.mockRejectedValueOnce(new Error("database unavailable"));

    const response = expectDataResult<{ error: string }>(
      await action(createActionArgs(batchFormData([["student-a", 3]]))),
    );

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe("학생 등록에 실패했어요. 잠시 후 다시 시도해 주세요");
    expect(logger.error).toHaveBeenCalledWith(
      "Recruited student action failed",
      expect.any(Error),
      expect.objectContaining({ route: "username.students.action", operation: "batch-write", batchSize: 1 }),
    );
    expect(mockedCaptureServerError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ route: "username.students.action", operation: "batch-write", batchSize: 1 }),
    );
  });

  it("returns Korean authentication and authorization failures", async () => {
    mockedGetActiveSensei.mockResolvedValueOnce(null);
    const unauthorized = expectDataResult<{ error: string }>(
      await action(createActionArgs(batchFormData([["student-a", 3]]))),
    );
    expect(unauthorized.init?.status).toBe(401);
    expect(unauthorized.data.error).toBe("로그인이 필요해요");

    mockedGetActiveSensei.mockResolvedValueOnce({ id: 1, uid: "sensei-1", username: "sensei" } as Awaited<
      ReturnType<typeof getActiveSensei>
    >);
    mockedGetRouteSensei.mockResolvedValueOnce({ id: 2, uid: "sensei-2", username: "other" } as Awaited<
      ReturnType<typeof getRouteSensei>
    >);
    const forbidden = expectDataResult<{ error: string }>(
      await action(createActionArgs(batchFormData([["student-a", 3]]))),
    );
    expect(forbidden.init?.status).toBe(403);
    expect(forbidden.data.error).toBe("본인 학생부만 수정할 수 있어요");
  });

  it("authorizes mutations by immutable sensei ID instead of username", async () => {
    const formData = new FormData();
    formData.append("intent", "growth-visibility");
    formData.append("growthVisibility", "on");

    mockedGetActiveSensei.mockResolvedValueOnce({ id: 1, uid: "sensei-1", username: "same-name" } as Awaited<
      ReturnType<typeof getActiveSensei>
    >);
    mockedGetRouteSensei.mockResolvedValueOnce({ id: 2, uid: "sensei-2", username: "same-name" } as Awaited<
      ReturnType<typeof getRouteSensei>
    >);
    const forbidden = expectDataResult<{ error: string }>(await action(createActionArgs(formData)));
    expect(forbidden.init?.status).toBe(403);
    expect(mockedUpdateSensei).not.toHaveBeenCalled();

    mockedGetActiveSensei.mockResolvedValueOnce({ id: 1, uid: "sensei-1", username: "old-name" } as Awaited<
      ReturnType<typeof getActiveSensei>
    >);
    mockedGetRouteSensei.mockResolvedValueOnce({ id: 1, uid: "sensei-1", username: "new-name" } as Awaited<
      ReturnType<typeof getRouteSensei>
    >);
    await expect(action(createActionArgs(formData))).resolves.toMatchObject({
      data: { intent: "growth-visibility", success: true },
    });
    expect(mockedUpdateSensei).toHaveBeenCalledTimes(1);
  });

  it("keeps single add and delete dispatch unchanged", async () => {
    const addFormData = new FormData();
    addFormData.append("studentUid", "student-a");
    addFormData.append("tier", "3");
    await action(createActionArgs(addFormData));
    expect(mockedUpsertRecruitedStudent).toHaveBeenCalledWith(env, 1, "student-a", 3);
    expect(mockedGetAllStudentsMap).toHaveBeenCalledTimes(1);

    const deleteFormData = new FormData();
    deleteFormData.append("studentUid", "student-a");
    await action(createActionArgs(deleteFormData, "DELETE"));
    expect(mockedRemoveRecruitedStudent).toHaveBeenCalledWith(env, 1, "student-a");
    expect(mockedAddRecruitedStudents).not.toHaveBeenCalled();
  });

  it("rejects an unknown single POST UID before writing", async () => {
    const formData = new FormData();
    formData.append("studentUid", "unknown-student");
    formData.append("tier", "3");

    const response = expectDataResult<{ error: string }>(await action(createActionArgs(formData)));

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("존재하지 않는 학생이에요");
    expect(mockedUpsertRecruitedStudent).not.toHaveBeenCalled();
  });

  it("uses singular Korean validation copy for an invalid single POST tier", async () => {
    const formData = new FormData();
    formData.append("studentUid", "student-a");
    formData.append("tier", "10");

    const response = expectDataResult<{ error: string }>(await action(createActionArgs(formData)));

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("성급 범위가 올바르지 않아요");
    expect(mockedGetAllStudentsMap).not.toHaveBeenCalled();
    expect(mockedUpsertRecruitedStudent).not.toHaveBeenCalled();
  });

  it("maps a typed single POST validation failure to singular Korean copy", async () => {
    mockedUpsertRecruitedStudent.mockRejectedValueOnce(new RecruitedStudentValidationError("internal validation"));
    const formData = new FormData();
    formData.append("studentUid", "student-a");
    formData.append("tier", "3");

    const response = expectDataResult<{ error: string }>(await action(createActionArgs(formData)));

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("성급 범위가 올바르지 않아요");
  });

  it("reports unexpected single write failures before returning a Korean 500", async () => {
    const writeError = new Error("database unavailable");
    mockedUpsertRecruitedStudent.mockRejectedValueOnce(writeError);
    const formData = new FormData();
    formData.append("studentUid", "student-a");
    formData.append("tier", "3");

    const response = expectDataResult<{ error: string }>(await action(createActionArgs(formData)));

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe("학생 등록에 실패했어요. 잠시 후 다시 시도해 주세요");
    expect(logger.error).toHaveBeenCalledWith(
      "Recruited student action failed",
      writeError,
      expect.objectContaining({ route: "username.students.action", operation: "single-write" }),
    );
    expect(mockedCaptureServerError).toHaveBeenCalledWith(
      writeError,
      expect.objectContaining({ route: "username.students.action", operation: "single-write" }),
    );
  });

  it("saves the separate growth visibility setting", async () => {
    const formData = new FormData();
    formData.append("intent", "growth-visibility");
    formData.append("growthVisibility", "on");

    const response = expectDataResult<{ intent: string; success: true; growthVisibility: boolean }>(
      await action(createActionArgs(formData)),
    );

    expect(response.data).toEqual({ intent: "growth-visibility", success: true, growthVisibility: true });
    expect(mockedUpdateSensei).toHaveBeenCalledWith(env, 1, { growthVisibility: true }, expect.any(Object));
  });

  it("patches only visible current fields and permits an omitted tier", async () => {
    mockedGetAllStudentsMap.mockResolvedValueOnce({
      "student-a": { uid: "student-a", released: true, initialTier: 3 },
    } as never);
    mockedGetRecruitedStudents.mockResolvedValueOnce([{ studentUid: "student-a", tier: 6 }] as never);
    mockedGetStudentDetailData.mockResolvedValueOnce({
      student: { equipments: ["hat", "bag", "watch"], catalog: { gear: {}, weapon: {} } },
      studentCatalog: {
        equipment: [
          { category: "hat", tier: 7, maxLevel: 70 },
          { category: "bag", tier: 7, maxLevel: 70 },
          { category: "watch", tier: 7, maxLevel: 70 },
        ],
      },
    } as never);
    const formData = new FormData();
    formData.append("intent", "current-state");
    formData.append("studentUid", "student-a");
    formData.append("level", "81");

    const response = expectDataResult<{ intent: string; success: true }>(await action(createActionArgs(formData)));

    expect(response.data).toEqual({ intent: "current-state", success: true });
    expect(mockedPatchRecruitedStudentCurrentState).toHaveBeenCalledWith(
      env,
      1,
      "student-a",
      { level: 81 },
      expect.objectContaining({ equipmentMaxLevelsByTier: expect.any(Array) }),
    );
  });

  it("rejects an unreleased student before reading or writing current state", async () => {
    mockedGetAllStudentsMap.mockResolvedValueOnce({
      "student-a": { uid: "student-a", released: false, initialTier: 3 },
    } as never);
    const formData = new FormData();
    formData.append("intent", "current-state");
    formData.append("studentUid", "student-a");
    formData.append("level", "81");

    const response = expectDataResult<{ intent: string; error: string }>(await action(createActionArgs(formData)));

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("출시되지 않은 학생이에요");
    expect(mockedGetRecruitedStudents).not.toHaveBeenCalled();
    expect(mockedPatchRecruitedStudentCurrentState).not.toHaveBeenCalled();
  });

  it("rejects hidden fields before any current-state write", async () => {
    const formData = new FormData();
    formData.append("intent", "current-state");
    formData.append("studentUid", "student-a");
    formData.append("weaponLevel", "20");

    const response = expectDataResult<{ intent: string; error: string }>(await action(createActionArgs(formData)));

    expect(response.init?.status).toBe(400);
    expect(response.data).toEqual({ intent: "current-state", error: "학생 성장 상태 입력이 올바르지 않아요" });
    expect(mockedPatchRecruitedStudentCurrentState).not.toHaveBeenCalled();
    expect(mockedGetAllStudentsMap).not.toHaveBeenCalled();
  });

  it("maps hidden-state tier conflicts to a validation response without writing", async () => {
    mockedGetAllStudentsMap.mockResolvedValueOnce({
      "student-a": { uid: "student-a", released: true, initialTier: 3 },
    } as never);
    mockedGetRecruitedStudents.mockResolvedValueOnce([{ studentUid: "student-a", tier: 6 }] as never);
    mockedGetStudentDetailData.mockResolvedValueOnce({
      student: { equipments: ["hat", "bag", "watch"], catalog: { gear: {}, weapon: {} } },
      studentCatalog: { equipment: [] },
    } as never);
    mockedPatchRecruitedStudentCurrentState.mockRejectedValueOnce(
      new RecruitedStudentValidationError("고유무기 레벨은(는) 현재 성급 기준 0부터 0 사이만 입력할 수 있어요"),
    );
    const formData = new FormData();
    formData.append("intent", "current-state");
    formData.append("studentUid", "student-a");
    formData.append("tier", "5");
    formData.append("level", "81");

    const response = expectDataResult<{ intent: string; error: string }>(await action(createActionArgs(formData)));

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("고유무기 레벨은(는) 현재 성급 기준 0부터 0 사이만 입력할 수 있어요");
    expect(mockedPatchRecruitedStudentCurrentState).toHaveBeenCalledTimes(1);
    expect(mockedUpsertRecruitedStudent).not.toHaveBeenCalled();
  });
});
