import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Attack } from "~/graphql/graphql";
import { captureServerError, getLogger } from "~/lib/observability.server";
import {
  addRecruitedStudents,
  getRecruitedStudents,
  RecruitedStudentValidationError,
  removeRecruitedStudent,
  upsertRecruitedStudent,
} from "~/models/recruited-student";
import { getStudentStateWriteMode } from "~/models/relationship-level";
import {
  getAllStudents,
  getAllStudentsMap,
  getStudentGrowthEquipmentCatalog,
  getStudentGrowthVisualsBatch,
} from "~/models/student";
import {
  StudentBasicInfoBatchConflictError,
  StudentBasicInfoBatchValidationError,
  saveStudentBasicInfoBatch,
} from "~/models/student-basic-info";
import { getRouteSensei } from "~/routes/$username._components/route-sensei.server";
import { action, loader } from "~/routes/$username.students";
import {
  createStudentsFilterState,
  STUDENTS_FILTER_COOKIE_NAME,
} from "~/routes/$username.students._components/students-filter";
import { getUserStudentsView } from "~/views/user-students.server";

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
  RecruitedStudentValidationError: class RecruitedStudentValidationError extends Error {},
}));

jest.mock("~/models/student", () => ({
  getAllStudents: jest.fn(),
  getAllStudentsMap: jest.fn(),
  getStudentGrowthEquipmentCatalog: jest.fn(),
  getStudentGrowthVisualsBatch: jest.fn(),
}));

jest.mock("~/models/relationship-level", () => ({
  getStudentStateWriteMode: jest.fn(),
}));

jest.mock("~/models/student-basic-info", () => ({
  saveStudentBasicInfoBatch: jest.fn(),
  StudentBasicInfoBatchConflictError: class StudentBasicInfoBatchConflictError extends Error {
    constructor(public conflicts: unknown[]) {
      super("conflict");
    }
  },
  StudentBasicInfoBatchValidationError: class StudentBasicInfoBatchValidationError extends Error {
    constructor(public errors: unknown[]) {
      super("invalid");
    }
  },
}));

jest.mock("~/views/user-students.server", () => ({
  getUserStudentsView: jest.fn(),
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
const mockedGetUserStudentsView = getUserStudentsView as jest.MockedFunction<typeof getUserStudentsView>;
const mockedGetStudentStateWriteMode = getStudentStateWriteMode as jest.MockedFunction<typeof getStudentStateWriteMode>;
const mockedSaveBatch = saveStudentBasicInfoBatch as jest.MockedFunction<typeof saveStudentBasicInfoBatch>;
const mockedGetGrowthVisuals = getStudentGrowthVisualsBatch as jest.MockedFunction<typeof getStudentGrowthVisualsBatch>;
const mockedGetEquipmentCatalog = getStudentGrowthEquipmentCatalog as jest.MockedFunction<
  typeof getStudentGrowthEquipmentCatalog
>;
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

function createLoaderArgs(cookie?: string, search = "") {
  return {
    context: { cloudflare: { env, ctx: {} as ExecutionContext } },
    request: new Request(`https://mollulog.test/@sensei/students${search}`, {
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
  mockedSaveBatch.mockResolvedValue(undefined as never);
  mockedGetGrowthVisuals.mockResolvedValue(new Map([["student-a", { gearAvailable: false }]]) as never);
  mockedGetEquipmentCatalog.mockResolvedValue([{ uid: "hat-1", category: "Hat", tier: 1, maxLevel: 10 }] as never);
});

describe("@username students loader", () => {
  const emptyView = {
    students: [],
    noRecruited: true,
    view: "summary",
    growthVisibility: true,
    canViewGrowth: true,
    equipmentLimits: [],
  };

  it("seeds the first render from the students filter cookie without the search text", async () => {
    mockedGetUserStudentsView.mockResolvedValue(emptyView as never);
    const state = { ...createStudentsFilterState("tier"), attackTypes: [Attack.Explosive], search: "아루" };
    const cookieValue = encodeURIComponent(JSON.stringify(state));

    const result = await loader(createLoaderArgs(`${STUDENTS_FILTER_COOKIE_NAME}=${cookieValue}`));

    expect(result.filterState).toEqual({ ...createStudentsFilterState("tier"), attackTypes: [Attack.Explosive] });
  });

  it("gives the owner the stored state format only for the growth view", async () => {
    mockedGetUserStudentsView.mockResolvedValue({ ...emptyView, view: "growth" } as never);
    mockedGetStudentStateWriteMode.mockResolvedValue("nullable" as never);

    const growth = await loader(createLoaderArgs(undefined, "?view=growth"));
    expect(growth.stateFormat).toBe("nullable");
    expect(mockedGetUserStudentsView).toHaveBeenLastCalledWith(env, expect.anything(), 1, "growth");

    mockedGetStudentStateWriteMode.mockClear();
    const summary = await loader(createLoaderArgs());
    expect(summary.stateFormat).toBeNull();
    expect(mockedGetStudentStateWriteMode).not.toHaveBeenCalled();
  });

  it("does not read the state format for a visitor", async () => {
    mockedGetUserStudentsView.mockResolvedValue({ ...emptyView, view: "growth" } as never);
    mockedGetActiveSensei.mockResolvedValueOnce({ id: 9, uid: "sensei-9", username: "visitor" } as never);

    const result = await loader(createLoaderArgs(undefined, "?view=growth"));

    expect(result.me).toBe(false);
    expect(result.stateFormat).toBeNull();
    expect(mockedGetStudentStateWriteMode).not.toHaveBeenCalled();
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
});

function growthFormData(overrides: { entries?: unknown; stateFormat?: string } = {}) {
  const formData = new FormData();
  formData.append("intent", "save-growth");
  formData.append("stateFormat", overrides.stateFormat ?? "nullable");
  formData.append(
    "entries",
    JSON.stringify(overrides.entries ?? [{ studentUid: "student-a", changes: { tier: 5 }, expected: { tier: 4 } }]),
  );
  return formData;
}

describe("@username students growth save", () => {
  beforeEach(() => {
    mockedGetAllStudents.mockResolvedValue([
      { uid: "student-a", initialTier: 3, equipments: ["Hat", "Gloves", "Shoes"] },
    ] as never);
  });

  it("saves every changed student in one batch with the catalog limits", async () => {
    const response = expectDataResult<{ ok: boolean; saved: number }>(await action(createActionArgs(growthFormData())));

    expect(response.data).toEqual({ ok: true, saved: 1 });
    expect(mockedSaveBatch).toHaveBeenCalledTimes(1);
    expect(mockedSaveBatch).toHaveBeenCalledWith(
      env,
      1,
      [{ studentUid: "student-a", changes: { tier: 5 }, expected: { tier: 4 } }],
      expect.objectContaining({
        requestMode: "nullable",
        equipmentLimits: [{ category: "Hat", tier: 1, maxLevel: 10 }],
      }),
    );
  });

  it.each([
    ["unknown state format", growthFormData({ stateFormat: "other" })],
    ["a non-array payload", growthFormData({ entries: {} })],
    ["an unknown field", growthFormData({ entries: [{ studentUid: "student-a", changes: { hp: 1 }, expected: {} }] })],
    ["an empty change set", growthFormData({ entries: [{ studentUid: "student-a", changes: {}, expected: {} }] })],
    [
      "a non-numeric value",
      growthFormData({ entries: [{ studentUid: "student-a", changes: { tier: "5" }, expected: {} }] }),
    ],
  ])("rejects %s before touching the database", async (_name, formData) => {
    const response = expectDataResult<{ ok: boolean; code: string }>(await action(createActionArgs(formData)));

    expect(response.init?.status).toBe(400);
    expect(response.data).toMatchObject({ ok: false, code: "FAILED" });
    expect(mockedSaveBatch).not.toHaveBeenCalled();
  });

  it("reports a student the catalog does not know as a validation failure", async () => {
    const response = expectDataResult<{ code: string; errors: { studentUid: string }[] }>(
      await action(
        createActionArgs(
          growthFormData({ entries: [{ studentUid: "student-x", changes: { tier: 5 }, expected: { tier: 4 } }] }),
        ),
      ),
    );

    expect(response.init?.status).toBe(400);
    expect(response.data.code).toBe("INVALID");
    expect(response.data.errors[0]?.studentUid).toBe("student-x");
    expect(mockedSaveBatch).not.toHaveBeenCalled();
  });

  it("returns the values another screen changed as a conflict", async () => {
    const conflicts = [{ studentUid: "student-a", field: "tier", current: 6 }];
    mockedSaveBatch.mockRejectedValueOnce(new StudentBasicInfoBatchConflictError(conflicts as never));

    const response = expectDataResult<{ code: string; conflicts: unknown[] }>(
      await action(createActionArgs(growthFormData())),
    );

    expect(response.init?.status).toBe(409);
    expect(response.data).toEqual({ ok: false, code: "CONFLICT", conflicts });
  });

  it("returns per-student validation failures from the model", async () => {
    const errors = [{ studentUid: "student-a", field: "level", message: "학생 Lv은 1부터 90까지 입력할 수 있어요" }];
    mockedSaveBatch.mockRejectedValueOnce(new StudentBasicInfoBatchValidationError(errors as never));

    const response = expectDataResult<{ code: string; errors: unknown[] }>(
      await action(createActionArgs(growthFormData())),
    );

    expect(response.init?.status).toBe(400);
    expect(response.data).toEqual({ ok: false, code: "INVALID", errors });
  });

  it("reports an unexpected failure without exposing the raw error", async () => {
    const failure = new Error("connection reset by peer");
    mockedSaveBatch.mockRejectedValueOnce(failure);

    const response = expectDataResult<{ code: string; error: string }>(
      await action(createActionArgs(growthFormData())),
    );

    expect(response.init?.status).toBe(500);
    expect(response.data.code).toBe("FAILED");
    expect(response.data.error).not.toContain("connection reset");
    expect(mockedCaptureServerError).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ operation: "growth-save", entryCount: 1 }),
    );
  });

  it("does not let a visitor save", async () => {
    mockedGetRouteSensei.mockResolvedValueOnce({ id: 2, uid: "sensei-2", username: "other" } as never);

    const response = expectDataResult<{ error: string }>(await action(createActionArgs(growthFormData())));

    expect(response.init?.status).toBe(403);
    expect(mockedSaveBatch).not.toHaveBeenCalled();
  });
});

describe("@username students single remove", () => {
  it("reports a failed remove instead of throwing", async () => {
    const failure = new Error("database unavailable");
    mockedRemoveRecruitedStudent.mockRejectedValueOnce(failure);
    const formData = new FormData();
    formData.append("studentUid", "student-a");

    const response = expectDataResult<{ error: string }>(await action(createActionArgs(formData, "DELETE")));

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe("학생을 제외하지 못했어요. 잠시 후 다시 시도해주세요.");
    expect(mockedCaptureServerError).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ operation: "single-remove" }),
    );
  });
});
