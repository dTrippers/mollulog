import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Post } from "~/models/post";
import { getPostByUid, getRecentNewsPosts } from "~/models/post";
import { getPostDetailView } from "~/views/post-detail";

const logger = { error: jest.fn() };

jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn(() => logger) }));
jest.mock("~/models/post", () => ({
  getPostByUid: jest.fn(),
  getRecentNewsPosts: jest.fn(),
}));

const mockedGetPostByUid = getPostByUid as jest.MockedFunction<typeof getPostByUid>;
const mockedGetRecentNewsPosts = getRecentNewsPosts as jest.MockedFunction<typeof getRecentNewsPosts>;
const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as Env;
const ctx = {} as ExecutionContext;

function post(overrides: Partial<Post> = {}): Post {
  return {
    uid: "post-1",
    title: "9/8 업데이트 안내",
    content: "본문",
    board: "news",
    timelineContentUid: null,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("getPostDetailView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null for a missing post without looking for recent news", async () => {
    mockedGetPostByUid.mockResolvedValue(null);

    await expect(getPostDetailView(env, "missing", { ctx })).resolves.toBeNull();
    expect(mockedGetRecentNewsPosts).not.toHaveBeenCalled();
  });

  it("loads a news post with a news back link and the three most recent other news posts", async () => {
    const current = post();
    mockedGetPostByUid.mockResolvedValue(current);
    mockedGetRecentNewsPosts.mockResolvedValue([post({ uid: "post-2", title: "8/30 업데이트 안내" })]);

    const view = await getPostDetailView(env, current.uid, { ctx });

    expect(mockedGetPostByUid).toHaveBeenCalledWith(env, current.uid, { ctx });
    expect(mockedGetRecentNewsPosts).toHaveBeenCalledWith(env, current.uid, 3, { ctx });
    expect(view).toEqual({
      post: { uid: "post-1", title: "9/8 업데이트 안내", content: "본문", createdAt: current.createdAt },
      back: { kind: "news" },
      recent: {
        status: "success",
        data: [{ uid: "post-2", title: "8/30 업데이트 안내", createdAt: current.createdAt }],
      },
    });
  });

  it("isolates a recent-news failure, keeps the post, and logs the failure", async () => {
    mockedGetPostByUid.mockResolvedValue(post());
    mockedGetRecentNewsPosts.mockRejectedValue(new Error("connection reset"));

    const view = await getPostDetailView(env, "post-1", { ctx });

    expect(view?.post.title).toBe("9/8 업데이트 안내");
    expect(view?.recent).toEqual({ status: "error" });
    expect(logger.error).toHaveBeenCalledWith("Failed to load recent news posts", expect.any(Error));
  });

  it("propagates a failed post lookup to the route boundary", async () => {
    mockedGetPostByUid.mockRejectedValue(new Error("db down"));

    await expect(getPostDetailView(env, "post-1", { ctx })).rejects.toThrow("db down");
  });

  it("links a non-news post with a linked event to that event, with no recent block", async () => {
    mockedGetPostByUid.mockResolvedValue(post({ board: "live", timelineContentUid: "jp-live-5-5th" }));

    const view = await getPostDetailView(env, "post-1", { ctx });

    expect(view?.back).toEqual({ kind: "event", timelineContentUid: "jp-live-5-5th" });
    expect(view?.recent).toBeNull();
    expect(mockedGetRecentNewsPosts).not.toHaveBeenCalled();
  });

  it("gives a non-news post without a linked event no back link", async () => {
    mockedGetPostByUid.mockResolvedValue(post({ board: "notice" }));

    const view = await getPostDetailView(env, "post-1", { ctx });

    expect(view?.back).toEqual({ kind: "none" });
    expect(view?.recent).toBeNull();
  });

  it("returns only the fields the screen needs", async () => {
    mockedGetPostByUid.mockResolvedValue(post({ board: "notice" }));

    const view = await getPostDetailView(env, "post-1", { ctx });

    expect(view?.post).not.toHaveProperty("board");
    expect(view?.post).not.toHaveProperty("timelineContentUid");
  });
});
