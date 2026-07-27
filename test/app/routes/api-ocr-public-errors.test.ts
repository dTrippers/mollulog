import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { cancelOcrJob, createOcrJob, getOcrJob, submitOcrJob } from "~/models/ocr-job";
import { getSyncDraftBySourceRef } from "~/models/sync-draft";
import { action as createAction } from "~/routes/api.ocr.jobs";
import { action as applyAction } from "~/routes/api.ocr.jobs.$jobUid.apply";
import { action as cancelAction } from "~/routes/api.ocr.jobs.$jobUid.cancel";
import { action as submitAction } from "~/routes/api.ocr.jobs.$jobUid.submit";

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(),
}));

jest.mock("~/models/ocr-job", () => ({
  OcrQuotaExceededError: class OcrQuotaExceededError extends Error {},
  cancelOcrJob: jest.fn(),
  createOcrJob: jest.fn(),
  getOcrJob: jest.fn(),
  getOcrUploadQuota: jest.fn(),
  listRecentOcrJobs: jest.fn(),
  publishPendingOcrOutbox: jest.fn(),
  submitOcrJob: jest.fn(),
}));

jest.mock("~/models/sync-draft", () => ({
  createAndApplySyncDraft: jest.fn(),
  getSyncDraftBySourceRef: jest.fn(),
  listSyncDraftsBySourceRefs: jest.fn(),
}));

jest.mock("~/models/student", () => ({
  getAllStudentsMap: jest.fn(),
}));

jest.mock("~/models/user-resource-inventory", () => ({
  getUserResourceInventoryMapByItemUids: jest.fn(),
}));

type DataResult<T> = {
  type: "DataWithResponseInit";
  data: T;
  init: ResponseInit | null;
};

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedCancelOcrJob = cancelOcrJob as jest.MockedFunction<typeof cancelOcrJob>;
const mockedCreateOcrJob = createOcrJob as jest.MockedFunction<typeof createOcrJob>;
const mockedGetOcrJob = getOcrJob as jest.MockedFunction<typeof getOcrJob>;
const mockedSubmitOcrJob = submitOcrJob as jest.MockedFunction<typeof submitOcrJob>;
const mockedGetSyncDraftBySourceRef = getSyncDraftBySourceRef as jest.MockedFunction<typeof getSyncDraftBySourceRef>;
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
const ctx = { waitUntil: jest.fn() };
const env = {} as Env;

function expectDataResult<T>(result: unknown): DataResult<T> {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as DataResult<T>;
}

function createArgs(
  path: string,
  body?: unknown,
  params: Record<string, string | undefined> = {},
): Parameters<typeof createAction>[0] {
  return {
    request: new Request(`https://mollulog.net${path}`, {
      method: "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    context: { cloudflare: { env, ctx } },
    params,
  } as never;
}

const validVideoRequest = {
  jobKind: "student_detail_video_v1",
  video: {
    filename: "students.mp4",
    contentType: "video/mp4",
    byteSize: 1024,
    sha256: "a".repeat(64),
  },
};

describe("public OCR API errors", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetLogger.mockReturnValue(logger);
  });

  it("keeps actionable upload validation messages public", async () => {
    const response = expectDataResult<{ error: string }>(
      await createAction(
        createArgs("/api/ocr/jobs", {
          ...validVideoRequest,
          video: { ...validVideoRequest.video, sha256: "invalid" },
        }),
      ),
    );

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("영상 파일 정보를 다시 확인해주세요");
    expect(mockedCreateOcrJob).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("does not expose storage configuration failures while creating a job", async () => {
    const internalError = new Error("OCR_R2_SECRET_ACCESS_KEY is missing");
    mockedCreateOcrJob.mockRejectedValue(internalError);

    const response = expectDataResult<{ error: string }>(
      await createAction(createArgs("/api/ocr/jobs", validVideoRequest)),
    );

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe("인식 작업을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
    expect(JSON.stringify(response.data)).not.toContain("OCR_R2");
    expect(logger.error).toHaveBeenCalledWith("OCR job creation failed", internalError);
  });

  it("does not expose queue or URL failures while submitting a job", async () => {
    const internalError = new Error("OCR Queue binding or presigned URL configuration is invalid");
    mockedSubmitOcrJob.mockRejectedValue(internalError);

    const response = expectDataResult<{ error: string }>(
      await submitAction(createArgs("/api/ocr/jobs/job-1/submit", undefined, { jobUid: "job-1" })),
    );

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe("업로드한 파일을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
    expect(JSON.stringify(response.data)).not.toContain("Queue");
    expect(JSON.stringify(response.data)).not.toContain("URL");
    expect(logger.error).toHaveBeenCalledWith("OCR job submission failed", internalError);
  });

  it("does not expose database failures while applying a result", async () => {
    const internalError = new Error("relation ocr_jobs does not exist");
    mockedGetOcrJob.mockRejectedValue(internalError);

    const response = expectDataResult<{ error: string }>(
      await applyAction(createArgs("/api/ocr/jobs/job-1/apply", { students: [] }, { jobUid: "job-1" })),
    );

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe("인식 결과를 반영하지 못했어요. 잠시 후 다시 시도해 주세요.");
    expect(JSON.stringify(response.data)).not.toContain("ocr_jobs");
    expect(logger.error).toHaveBeenCalledWith("OCR job application failed", internalError);
  });

  it("does not expose database failures while cancelling a result", async () => {
    const internalError = new Error("relation ocr_jobs does not exist");
    mockedCancelOcrJob.mockRejectedValue(internalError);

    const response = expectDataResult<{ error: string }>(
      await cancelAction(createArgs("/api/ocr/jobs/job-1/cancel", undefined, { jobUid: "job-1" })),
    );

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe("인식 결과를 취소하지 못했어요. 잠시 후 다시 시도해 주세요.");
    expect(JSON.stringify(response.data)).not.toContain("ocr_jobs");
    expect(logger.error).toHaveBeenCalledWith("OCR job cancellation failed", internalError);
  });

  it("cancels an unapplied review result", async () => {
    mockedCancelOcrJob.mockResolvedValue({ uid: "job-1", status: "cancelled" });

    const response = expectDataResult<{ uid: string; status: string }>(
      await cancelAction(createArgs("/api/ocr/jobs/job-1/cancel", undefined, { jobUid: "job-1" })),
    );

    expect(response.init).toBeNull();
    expect(response.data).toEqual({ uid: "job-1", status: "cancelled" });
    expect(mockedGetSyncDraftBySourceRef).toHaveBeenCalledWith(env, 7, "first_party_ocr", "job-1");
    expect(mockedCancelOcrJob).toHaveBeenCalledWith(env, 7, "job-1", { ctx });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("rejects cancelling an already-applied result", async () => {
    mockedGetSyncDraftBySourceRef.mockResolvedValue({ status: "applied" } as never);

    const response = expectDataResult<{ error: string }>(
      await cancelAction(createArgs("/api/ocr/jobs/job-1/cancel", undefined, { jobUid: "job-1" })),
    );

    expect(response.init?.status).toBe(409);
    expect(response.data.error).toBe("이미 반영한 인식 결과는 취소할 수 없어요");
    expect(mockedCancelOcrJob).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
