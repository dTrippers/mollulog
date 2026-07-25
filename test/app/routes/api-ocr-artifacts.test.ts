import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { getOwnedOcrArtifactObjectKey } from "~/models/ocr-job";
import { loader } from "~/routes/api.ocr.jobs.$jobUid.artifacts.$artifactUid";

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));
jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(),
}));
jest.mock("~/models/ocr-job", () => ({
  getOwnedOcrArtifactObjectKey: jest.fn(),
}));

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetObjectKey = getOwnedOcrArtifactObjectKey as jest.MockedFunction<typeof getOwnedOcrArtifactObjectKey>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const getObject = jest.fn();

function createArgs() {
  return {
    request: new Request("https://mollulog.net/api/ocr/jobs/job-1/artifacts/artifact-1"),
    context: {
      cloudflare: {
        env: {
          OCR_UPLOADS: { get: getObject },
        },
        ctx: {},
      },
    },
    params: { jobUid: "job-1", artifactUid: "artifact-1" },
  } as never;
}

describe("OCR representative frame route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetLogger.mockReturnValue(logger);
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
  });

  it("requires an authenticated user", async () => {
    mockedGetActiveSensei.mockResolvedValue(null);

    const response = await loader(createArgs());

    expect(response).toMatchObject({ init: { status: 401 } });
    expect(mockedGetObjectKey).not.toHaveBeenCalled();
  });

  it("returns the same 404 when the artifact is not owned by the user", async () => {
    mockedGetObjectKey.mockResolvedValue(null);

    const response = await loader(createArgs());

    expect(response).toMatchObject({ init: { status: 404 } });
    expect(mockedGetObjectKey).toHaveBeenCalledWith(expect.anything(), 7, "job-1", "artifact-1", expect.anything());
    expect(getObject).not.toHaveBeenCalled();
  });

  it("streams only the resolved private object without exposing a presigned URL", async () => {
    mockedGetObjectKey.mockResolvedValue("ocr/prod/job-1/artifacts/1/artifact-1.webp");
    getObject.mockResolvedValue({
      body: new Blob(["webp"]).stream(),
      size: 4,
    } as never);

    const response = await loader(createArgs());

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Content-Type")).toBe("image/webp");
    expect((response as Response).headers.get("Cache-Control")).toBe("private, no-store");
    expect((response as Response).headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await (response as Response).text()).toBe("webp");
  });
});
