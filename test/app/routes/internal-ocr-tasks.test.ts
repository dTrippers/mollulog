import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { OcrTaskResultRejectedError } from "~/domain/ocr";
import { getLogger } from "~/lib/observability.server";
import { isAuthorizedOcrMachineRequest } from "~/lib/ocr-machine-auth.server";
import { claimOcrTask, commitOcrTaskResult, publishPendingOcrOutbox } from "~/models/ocr-job";
import { action as claimAction } from "~/routes/internal.ocr.v1.tasks.$taskUid.claim";
import { action as resultAction } from "~/routes/internal.ocr.v1.tasks.$taskUid.result";

jest.mock("~/lib/ocr-machine-auth.server", () => ({
  isAuthorizedOcrMachineRequest: jest.fn(),
}));

jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(),
}));

jest.mock("~/models/ocr-job", () => ({
  claimOcrTask: jest.fn(),
  commitOcrTaskResult: jest.fn(),
  publishPendingOcrOutbox: jest.fn(),
}));

type DataResult<T> = {
  type: "DataWithResponseInit";
  data: T;
  init: ResponseInit | null;
};

const mockedAuthorize = isAuthorizedOcrMachineRequest as jest.MockedFunction<typeof isAuthorizedOcrMachineRequest>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedClaim = claimOcrTask as jest.MockedFunction<typeof claimOcrTask>;
const mockedCommit = commitOcrTaskResult as jest.MockedFunction<typeof commitOcrTaskResult>;
const mockedPublish = publishPendingOcrOutbox as jest.MockedFunction<typeof publishPendingOcrOutbox>;
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
const waitUntil = jest.fn();
const env = {} as Env;

function expectDataResult<T>(result: unknown): DataResult<T> {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as DataResult<T>;
}

function createActionArgs(body: unknown): Parameters<typeof claimAction>[0] {
  return {
    request: new Request("https://mollulog.net/internal/ocr/v1/tasks/task-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    context: { cloudflare: { env, ctx: { waitUntil } } },
    params: { taskUid: "task-1" },
  } as never;
}

const validResult = {
  type: "ocr.image.recognize.v1",
  generation: 1,
  attemptUid: "attempt-1",
  status: "succeeded",
  inputSha256: "a".repeat(64),
  modelVersion: "model-1",
  catalogVersion: "catalog-1",
  schemaVersion: "1",
  result: { observations: [] },
};

describe("internal OCR task routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuthorize.mockResolvedValue(true);
    mockedGetLogger.mockReturnValue(logger);
    mockedPublish.mockResolvedValue(0);
  });

  it("returns a stable 400 response for malformed claim payloads", async () => {
    const response = expectDataResult<{ error: string }>(await claimAction(createActionArgs({ generation: 1 })));

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("Invalid OCR task request");
    expect(mockedClaim).not.toHaveBeenCalled();
  });

  it("logs claim failures without exposing the original error", async () => {
    const internalError = new Error("database password appeared here");
    mockedClaim.mockRejectedValue(internalError);

    const response = expectDataResult<{ error: string }>(
      await claimAction(
        createActionArgs({
          type: "ocr.image.recognize.v1",
          generation: 1,
          workerId: "worker-1",
          queueAttempts: 1,
        }),
      ),
    );

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe("OCR task claim failed");
    expect(JSON.stringify(response.data)).not.toContain(internalError.message);
    expect(logger.error).toHaveBeenCalledWith("OCR task claim failed", internalError, {
      taskType: "ocr.image.recognize.v1",
      generation: 1,
    });
  });

  it("returns a stable 400 response when the result is rejected", async () => {
    mockedCommit.mockRejectedValue(new OcrTaskResultRejectedError("input hash mismatch"));

    const response = expectDataResult<{ error: string }>(await resultAction(createActionArgs(validResult)));

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("OCR task result rejected");
    expect(JSON.stringify(response.data)).not.toContain("input hash mismatch");
  });

  it("logs unexpected result failures and returns a stable 500 response", async () => {
    const internalError = new Error("relation ocr_attempts does not exist");
    mockedCommit.mockRejectedValue(internalError);

    const response = expectDataResult<{ error: string }>(await resultAction(createActionArgs(validResult)));

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe("OCR task result failed");
    expect(JSON.stringify(response.data)).not.toContain(internalError.message);
    expect(logger.error).toHaveBeenCalledWith("OCR task result commit failed", internalError, {
      taskType: "ocr.image.recognize.v1",
      generation: 1,
    });
  });
});
