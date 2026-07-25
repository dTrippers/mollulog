import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getLogger } from "~/lib/observability.server";
import { isAuthorizedOcrMachineRequest } from "~/lib/ocr-machine-auth.server";
import { prepareOcrResultArtifacts } from "~/models/ocr-job";
import { action } from "~/routes/internal.ocr.v1.tasks.$taskUid.artifacts";

jest.mock("~/lib/ocr-machine-auth.server", () => ({
  isAuthorizedOcrMachineRequest: jest.fn(),
}));
jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(),
}));
jest.mock("~/models/ocr-job", () => ({
  prepareOcrResultArtifacts: jest.fn(),
}));

const mockedAuthorize = isAuthorizedOcrMachineRequest as jest.MockedFunction<typeof isAuthorizedOcrMachineRequest>;
const mockedPrepare = prepareOcrResultArtifacts as jest.MockedFunction<typeof prepareOcrResultArtifacts>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const validBody = {
  type: "ocr.student_detail_video.recognize.v1",
  generation: 1,
  attemptUid: "attempt-1",
  artifacts: [
    {
      studentUid: "10000",
      sourceFrame: 12,
      timestampSeconds: 0.4,
      contentType: "image/webp" as const,
      byteSize: 4096,
      sha256: "a".repeat(64),
      width: 1040,
      height: 480,
    },
  ],
};

function createArgs(body: unknown) {
  return {
    request: new Request("https://mollulog.net/internal/ocr/v1/tasks/job-1/artifacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    context: { cloudflare: { env: {}, ctx: {} } },
    params: { taskUid: "job-1" },
  } as never;
}

describe("internal OCR artifact route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuthorize.mockResolvedValue(true);
    mockedGetLogger.mockReturnValue(logger);
  });

  it("rejects requests without the machine credential", async () => {
    mockedAuthorize.mockResolvedValue(false);

    const response = await action(createArgs(validBody));

    expect(response).toMatchObject({ init: { status: 401 } });
    expect(mockedPrepare).not.toHaveBeenCalled();
  });

  it("rejects malformed or non-WebP manifests before storage allocation", async () => {
    const response = await action(
      createArgs({
        ...validBody,
        artifacts: [{ ...validBody.artifacts[0], contentType: "image/png" }],
      }),
    );

    expect(response).toMatchObject({ init: { status: 400 } });
    expect(mockedPrepare).not.toHaveBeenCalled();
  });

  it("passes the exact task, attempt, and manifest to the model", async () => {
    mockedPrepare.mockResolvedValue({
      artifacts: [
        {
          artifactUid: "artifact-1",
          studentUid: "10000",
          uploadUrl: "https://storage.example.test/object?signature=secret",
          requiredHeaders: {
            "content-type": "image/webp",
            "x-amz-checksum-sha256": "checksum",
          },
        },
      ],
    });

    const response = await action(createArgs(validBody));

    expect(response).toMatchObject({
      data: {
        artifacts: [expect.objectContaining({ artifactUid: "artifact-1", studentUid: "10000" })],
      },
    });
    expect(mockedPrepare).toHaveBeenCalledWith(
      expect.anything(),
      {
        type: "ocr.student_detail_video.recognize.v1",
        taskUid: "job-1",
        generation: 1,
      },
      {
        attemptUid: "attempt-1",
        artifacts: validBody.artifacts,
      },
      expect.anything(),
    );
  });
});
