import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { captureServerError, getLogger } from "~/lib/observability.server";
import {
  addRecruitedStudents,
  RecruitedStudentValidationError,
  removeRecruitedStudent,
  upsertRecruitedStudent,
} from "~/models/recruited-student";
import { getAllStudentsMap } from "~/models/student";
import { getRouteSensei } from "~/routes/$username._components/route-sensei.server";
import { action } from "~/routes/$username.students";

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
}));

jest.mock("~/components/features/students", () => ({
  createStudentFilterState: jest.fn(),
  getFilteredStudentUids: jest.fn(),
  StudentCards: jest.fn(() => null),
  StudentFilter: jest.fn(() => null),
  TierSelector: jest.fn(() => null),
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
const mockedGetAllStudentsMap = getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>;
const mockedRemoveRecruitedStudent = removeRecruitedStudent as jest.MockedFunction<typeof removeRecruitedStudent>;
const mockedUpsertRecruitedStudent = upsertRecruitedStudent as jest.MockedFunction<typeof upsertRecruitedStudent>;
const mockedAddRecruitedStudents = addRecruitedStudents as jest.MockedFunction<typeof addRecruitedStudents>;
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
  mockedGetAllStudentsMap.mockResolvedValue({
    "student-a": { uid: "student-a", released: true, initialTier: 3 },
    "student-b": { uid: "student-b", released: true, initialTier: 5 },
  } as unknown as Awaited<ReturnType<typeof getAllStudentsMap>>);
  mockedRemoveRecruitedStudent.mockResolvedValue(undefined);
  mockedUpsertRecruitedStudent.mockResolvedValue(undefined);
  mockedAddRecruitedStudents.mockResolvedValue(undefined);
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
