import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { deletePostgresWalkthroughTimelineWithCommunityPost } from "~/db/postgres/walkthrough-timelines";
import { action } from "~/routes/timelines.$uid";

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedDeleteTimeline = deletePostgresWalkthroughTimelineWithCommunityPost as jest.MockedFunction<
  typeof deletePostgresWalkthroughTimelineWithCommunityPost
>;
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/db/postgres/walkthrough-timelines", () => ({
  clonePostgresWalkthroughTimeline: jest.fn(),
  deletePostgresWalkthroughTimelineWithCommunityPost: jest.fn(),
  getPostgresWalkthroughTimeline: jest.fn(),
}));
jest.mock("~/lib/observability.server", () => ({
  getLogger: () => logger,
}));

const env = {} as Env;
const ctx = {} as ExecutionContext;

function actionArgs(request: Request) {
  return {
    context: { cloudflare: { env, ctx } },
    request,
    params: { uid: "timeline-1" },
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetActiveSensei.mockResolvedValue({ id: 7, username: "sensei" } as never);
  mockedDeleteTimeline.mockResolvedValue(true);
});

describe("walkthrough timeline detail delete action", () => {
  it("returns a safe retryable error when deletion fails unexpectedly", async () => {
    const internalError = new Error("database timeout; password=secret");
    mockedDeleteTimeline.mockRejectedValueOnce(internalError);

    const formData = new FormData();
    formData.set("intent", "delete");
    const response = await action(
      actionArgs(new Request("https://mollulog.test/timelines/timeline-1", { method: "POST", body: formData })),
    );

    expect(response).toMatchObject({
      data: { error: "타임라인을 삭제하지 못했어요. 잠시 후 다시 시도해주세요." },
      init: { status: 500 },
    });
    expect(JSON.stringify(response)).not.toContain("password=secret");
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to delete walkthrough timeline",
      internalError,
      expect.objectContaining({ operation: "delete", timelineUid: "timeline-1", userId: 7 }),
    );
  });
});
