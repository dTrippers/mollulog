import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Post } from "~/models/post";
import { getPostByUid } from "~/models/post";
import { loader, meta } from "~/routes/posts.$uid";

jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn(() => ({ error: jest.fn() })) }));
jest.mock("~/models/post", () => ({
  getPostByUid: jest.fn(),
  getRecentNewsPosts: jest.fn(),
}));

const mockedGetPostByUid = getPostByUid as jest.MockedFunction<typeof getPostByUid>;
const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as Env;
const ctx = {} as ExecutionContext;

function createLoaderArgs(params: Record<string, string | undefined> = {}) {
  return {
    request: new Request("https://mollulog.net/posts/post-1"),
    context: { cloudflare: { env, ctx } },
    params,
  } as never;
}

function post(overrides: Partial<Post> = {}): Post {
  return {
    uid: "post-1",
    title: "서비스 업데이트",
    content: "본문입니다.",
    board: "internal-notice",
    timelineContentUid: null,
    thumbnailImageUrl: null,
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("post detail route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads a post by uid regardless of its board", async () => {
    const loadedPost = post({ board: "announcement" });
    mockedGetPostByUid.mockResolvedValue(loadedPost);

    const result = await loader(createLoaderArgs({ uid: loadedPost.uid }));

    expect(result.post).toEqual({
      uid: loadedPost.uid,
      title: loadedPost.title,
      content: loadedPost.content,
      thumbnailImageUrl: null,
      createdAt: loadedPost.createdAt,
    });
    expect(result.post).not.toHaveProperty("board");
    expect(result.post).not.toHaveProperty("timelineContentUid");
    expect(result.recent).toBeNull();
    expect(mockedGetPostByUid).toHaveBeenCalledWith(env, loadedPost.uid, { ctx });
  });

  it.each([
    ["missing uid", {}, undefined],
    ["unknown uid", { uid: "missing" }, null],
  ])("returns a friendly 404 for %s", async (_label, params, result) => {
    mockedGetPostByUid.mockResolvedValue(result as Post | null);

    await expect(loader(createLoaderArgs(params))).rejects.toMatchObject({
      init: { status: 404 },
      data: { error: { code: "post.not_found", message: "게시물을 찾을 수 없어요." } },
    });
  });

  it("derives title, description, and canonical metadata from the post title and path", () => {
    const loadedPost = post({ title: "새로운 공지" });
    const descriptors = meta({
      data: { post: loadedPost },
      location: { pathname: `/posts/${loadedPost.uid}` },
    } as never);

    expect(descriptors).toEqual([
      { title: "새로운 공지 | 몰루로그" },
      { name: "description", content: "새로운 공지 게시물 내용을 확인해보세요." },
      { property: "og:image", content: "https://mollulog.net/mollulog-og.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://mollulog.net/mollulog-og.png" },
      { tagName: "link", rel: "canonical", href: `https://mollulog.net/posts/${loadedPost.uid}` },
    ]);
  });

  it("uses the post thumbnail as the social preview image when present", () => {
    const loadedPost = post({ thumbnailImageUrl: "https://cdn.example.test/post.png" });
    const descriptors = meta({
      data: { post: loadedPost },
      location: { pathname: `/posts/${loadedPost.uid}` },
    } as never);

    expect(descriptors).toContainEqual({ property: "og:image", content: loadedPost.thumbnailImageUrl });
    expect(descriptors).toContainEqual({ name: "twitter:image", content: loadedPost.thumbnailImageUrl });
  });
});
