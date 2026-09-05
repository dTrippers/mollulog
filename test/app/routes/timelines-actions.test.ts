import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  createPostgresWalkthroughTimelineWithCommunityPost,
  getPostgresWalkthroughTimeline,
  updatePostgresWalkthroughTimelineWithCommunityPost,
} from "~/db/postgres/walkthrough-timelines";
import { action as editAction } from "~/routes/timelines.$uid_.edit";
import { action as createAction } from "~/routes/timelines.new";

const mockGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockCreateTimeline = createPostgresWalkthroughTimelineWithCommunityPost as jest.MockedFunction<
  typeof createPostgresWalkthroughTimelineWithCommunityPost
>;
const mockGetTimeline = getPostgresWalkthroughTimeline as jest.MockedFunction<typeof getPostgresWalkthroughTimeline>;
const mockUpdateTimeline = updatePostgresWalkthroughTimelineWithCommunityPost as jest.MockedFunction<
  typeof updatePostgresWalkthroughTimelineWithCommunityPost
>;
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/db/postgres/walkthrough-timelines", () => ({
  createPostgresWalkthroughTimelineWithCommunityPost: jest.fn(),
  getPostgresWalkthroughTimeline: jest.fn(),
  updatePostgresWalkthroughTimelineWithCommunityPost: jest.fn(),
}));
jest.mock("~/lib/observability.server", () => ({
  getLogger: () => logger,
}));

const env = {} as Env;
const ctx = {} as ExecutionContext;
const document = {
  type: "walkthrough_timeline",
  schemaVersion: 1,
  partySize: 6,
  context: { bossUid: "boss-1", terrain: "indoor", defenseType: "heavy", maxDifficulty: "torment" },
  parties: [],
};

function requestWithForm(values: Record<string, string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return new Request("https://mollulog.test/timelines", { method: "POST", body: form });
}

function actionArgs(request: Request, params: Record<string, string> = {}) {
  return {
    context: { cloudflare: { env, ctx } },
    request,
    params,
  } as never;
}

function validFields(overrides: Record<string, string> = {}) {
  return {
    title: "공략",
    description: "설명",
    visibility: "public",
    document: JSON.stringify(document),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 7 } as never);
  mockCreateTimeline.mockResolvedValue({ uid: "timeline-1" } as never);
  mockGetTimeline.mockResolvedValue({ uid: "timeline-1", userId: 7 } as never);
  mockUpdateTimeline.mockResolvedValue({ uid: "timeline-1" } as never);
});

describe("walkthrough timeline create action", () => {
  it("keeps validation errors actionable as 400 responses", async () => {
    const response = await createAction(actionArgs(requestWithForm(validFields({ visibility: "invalid" }))));

    expect(response).toMatchObject({ data: { error: "공개 범위를 확인해주세요." }, init: { status: 400 } });
    expect(mockCreateTimeline).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("returns a safe retryable 500 and logs unexpected transaction failures", async () => {
    const internalError = new Error("SQL timeout; password=secret");
    mockCreateTimeline.mockRejectedValueOnce(internalError);

    const response = await createAction(actionArgs(requestWithForm(validFields())));

    expect(response).toMatchObject({
      data: { error: "타임라인을 저장하지 못했어요. 잠시 후 다시 시도해주세요." },
      init: { status: 500 },
    });
    expect(JSON.stringify(response)).not.toContain("password=secret");
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to create walkthrough timeline",
      internalError,
      expect.objectContaining({ operation: "create", userId: 7 }),
    );
  });
});

describe("walkthrough timeline edit action", () => {
  it("keeps validation errors actionable as 400 responses", async () => {
    const response = await editAction(
      actionArgs(requestWithForm(validFields({ visibility: "invalid" })), { uid: "timeline-1" }),
    );

    expect(response).toMatchObject({ data: { error: "공개 범위를 확인해주세요." }, init: { status: 400 } });
    expect(mockUpdateTimeline).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("returns a safe retryable 500 and logs unexpected transaction failures", async () => {
    const internalError = new Error("database timeout; password=secret");
    mockUpdateTimeline.mockRejectedValueOnce(internalError);

    const response = await editAction(actionArgs(requestWithForm(validFields()), { uid: "timeline-1" }));

    expect(response).toMatchObject({
      data: { error: "타임라인을 저장하지 못했어요. 잠시 후 다시 시도해주세요." },
      init: { status: 500 },
    });
    expect(JSON.stringify(response)).not.toContain("password=secret");
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to update walkthrough timeline",
      internalError,
      expect.objectContaining({ operation: "update", timelineUid: "timeline-1", userId: 7 }),
    );
  });
});
