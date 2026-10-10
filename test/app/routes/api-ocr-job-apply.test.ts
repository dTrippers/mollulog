import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { StudentStateMergeConflictError } from "~/domain/student-state-errors";
import { getLogger } from "~/lib/observability.server";
import { getOcrJob } from "~/models/ocr-job";
import { getAllStudentsMap } from "~/models/student";
import { createAndApplySyncDraft, getSyncDraftBySourceRef } from "~/models/sync-draft";
import { action } from "~/routes/api.ocr.jobs.$jobUid.apply";
import fixture from "../../fixtures/student-detail-video-result.v1.json";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/models/ocr-job", () => ({ getOcrJob: jest.fn() }));
jest.mock("~/models/student", () => ({ getAllStudentsMap: jest.fn() }));
jest.mock("~/models/sync-draft", () => ({ createAndApplySyncDraft: jest.fn(), getSyncDraftBySourceRef: jest.fn() }));

type DataResult<T> = { type: "DataWithResponseInit"; data: T; init: ResponseInit | null };
const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedGetOcrJob = getOcrJob as jest.MockedFunction<typeof getOcrJob>;
const mockedGetDraft = getSyncDraftBySourceRef as jest.MockedFunction<typeof getSyncDraftBySourceRef>;
const mockedGetAllStudentsMap = getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>;
const mockedCreateAndApply = createAndApplySyncDraft as jest.MockedFunction<typeof createAndApplySyncDraft>;
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const env = {} as Env;
const ctx = { waitUntil: jest.fn() };

function expectDataResult<T>(result: unknown): DataResult<T> {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as DataResult<T>;
}

describe("OCR item apply contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetLogger.mockReturnValue(logger);
    mockedGetDraft.mockResolvedValue(null);
    mockedGetOcrJob.mockResolvedValue({
      uid: "job-1",
      jobKind: "item_inventory_images_v1",
      status: "review_ready",
      generation: 1,
      images: [],
      result: null,
    } as never);
  });

  it("rejects an unsupported item payload without exposing internal details", async () => {
    const response = expectDataResult<{ error: string }>(
      await action({
        request: new Request("https://mollulog.net/api/ocr/jobs/job-1/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [{ itemUid: "internal-item", quantity: 4 }] }),
        }),
        context: { cloudflare: { env, ctx } },
        params: { jobUid: "job-1" },
      } as never),
    );

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("이 인식 결과는 현재 검토 화면에서 반영할 수 없어요");
    expect(response.data.error).not.toContain("internal-item");
  });
});

describe("OCR student apply contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetLogger.mockReturnValue(logger);
    mockedGetDraft.mockResolvedValue(null);
    mockedGetAllStudentsMap.mockResolvedValue({ "10000": {} } as never);
    mockedGetOcrJob.mockResolvedValue({
      uid: "job-1",
      jobKind: "student_detail_video_v1",
      status: "review_ready",
      result: fixture,
    } as never);
  });

  it("reports confirmed values that conflict with the stored student state as a rule error", async () => {
    mockedCreateAndApply.mockRejectedValueOnce(new StudentStateMergeConflictError());
    const response = expectDataResult<{ error: string }>(
      await action({
        request: new Request("https://mollulog.net/api/ocr/jobs/job-1/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            students: [{ studentUid: "10000", current: { tier: 7 }, confirmedFields: ["tier"] }],
          }),
        }),
        context: { cloudflare: { env, ctx } },
        params: { jobUid: "job-1" },
      } as never),
    );

    expect(mockedCreateAndApply).toHaveBeenCalledTimes(1);
    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("학생 성장도 값이 현재 성장 규칙에 맞지 않아요");
    expect(logger.error).not.toHaveBeenCalled();
  });
});
