import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  createPostgresContentComment,
  getPostgresCommunityPostByUid,
  getPostgresContentComments,
  updatePostgresCommunityComment,
  updatePostgresContentOpinion,
} from "~/db/postgres/community";
import { getContentRecruitmentPeriod, updateComment } from "~/models/content.server";
import { getRecruitmentGroupByUidStrict, normalizeRecruitmentGroupPeriod } from "~/models/recruitment";
import { getHideRecruitmentOpinions } from "~/models/sensei";
import { getTimelineContent } from "~/models/timeline-content.server";
import { action } from "~/routes/api.contents.$uid.comments";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/db/postgres/community", () => ({
  createPostgresContentComment: jest.fn(),
  getPostgresCommunityPostByUid: jest.fn(),
  getPostgresContentComments: jest.fn(),
  updatePostgresCommunityComment: jest.fn(),
  updatePostgresContentOpinion: jest.fn(),
}));
jest.mock("~/models/recruitment", () => ({
  getRecruitmentGroupByUidStrict: jest.fn(),
  normalizeRecruitmentGroupPeriod: jest.fn(),
}));
jest.mock("~/models/timeline-content.server", () => ({ getTimelineContent: jest.fn() }));
jest.mock("~/models/recruitment-opinion-classifier.server", () => ({
  classifyAndPersistRecruitmentOpinion: jest.fn(),
}));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/models/sensei", () => ({ getHideRecruitmentOpinions: jest.fn() }));

const env = {} as Env;
const ctx = { waitUntil: jest.fn() } as unknown as ExecutionContext;

describe("opinion write classification boundaries", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(getActiveSensei).mockResolvedValue({ id: 1 } as never);
    jest.mocked(getPostgresContentComments).mockResolvedValue({});
    jest.mocked(getHideRecruitmentOpinions).mockResolvedValue(true);
    jest.mocked(getPostgresCommunityPostByUid).mockResolvedValue({
      postType: "event_opinion",
      subjectContentUid: "content-1",
      author: { id: 1 },
    } as never);
  });

  it.each(["create", "update"])("rejects %s before writing when recruitment lookup fails", async (intent) => {
    jest.mocked(getTimelineContent).mockResolvedValue({ recruitmentGroupUid: "group-1" } as never);
    const error = new Error("recruitment source unavailable");
    jest.mocked(getRecruitmentGroupByUidStrict).mockRejectedValue(error);
    const request = new Request("https://mollulog.test/api/contents/content-1/comments", {
      method: "POST",
      body: JSON.stringify({ action: intent, commentUid: "opinion-1", body: "edited" }),
    });
    await expect(
      action({
        request,
        url: new URL(request.url),
        pattern: "/api/contents/:uid/comments",
        params: { uid: "content-1" },
        context: { cloudflare: { env, ctx } },
      }),
    ).rejects.toBe(error);
    expect(createPostgresContentComment).not.toHaveBeenCalled();
    expect(updatePostgresContentOpinion).not.toHaveBeenCalled();
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });

  it("allows contents without a recruitment group to remain unclassified", async () => {
    jest.mocked(getTimelineContent).mockResolvedValue({ recruitmentGroupUid: null } as never);
    await expect(getContentRecruitmentPeriod(env, "content-1")).resolves.toBeNull();
    expect(getRecruitmentGroupByUidStrict).not.toHaveBeenCalled();
  });

  it("rejects edits through another content before changing classification", async () => {
    jest.mocked(getPostgresCommunityPostByUid).mockResolvedValue({
      postType: "event_opinion",
      subjectContentUid: "content-1",
      author: { id: 1 },
    } as never);
    await expect(updateComment(env, 1, "content-2", "opinion-1", "edited", "public")).rejects.toMatchObject({
      status: 404,
    });
    expect(updatePostgresContentOpinion).not.toHaveBeenCalled();
  });

  it("passes the current content scope into the atomic opinion update", async () => {
    jest.mocked(getPostgresCommunityPostByUid).mockResolvedValue({
      postType: "event_opinion",
      subjectContentUid: "content-1",
      author: { id: 1 },
    } as never);
    const job = { postUid: "opinion-1", body: "edited" };
    jest.mocked(updatePostgresContentOpinion).mockResolvedValue(job);
    jest.mocked(getTimelineContent).mockResolvedValue({ recruitmentGroupUid: "group-1" } as never);
    jest.mocked(getRecruitmentGroupByUidStrict).mockResolvedValue({ uid: "group-1" } as never);
    const startAt = "2026-09-01T00:00:00Z";
    jest.mocked(normalizeRecruitmentGroupPeriod).mockReturnValue({ startAt } as never);
    await expect(updateComment(env, 1, "content-1", "opinion-1", "edited", "public")).resolves.toEqual(job);
    expect(updatePostgresContentOpinion).toHaveBeenCalledWith(env, 1, "content-1", "opinion-1", "edited", "public", {
      recruitmentPeriodStartAt: startAt,
    });
  });

  it("edits a reply without querying recruitment even when the source is unavailable", async () => {
    jest.mocked(getPostgresCommunityPostByUid).mockResolvedValue(null);
    jest.mocked(getRecruitmentGroupByUidStrict).mockRejectedValue(new Error("source unavailable"));
    const request = new Request("https://mollulog.test/api/contents/content-1/comments", {
      method: "POST",
      body: JSON.stringify({ action: "update", commentUid: "reply-1", body: "edited" }),
    });
    await expect(
      action({
        request,
        url: new URL(request.url),
        pattern: "/api/contents/:uid/comments",
        params: { uid: "content-1" },
        context: { cloudflare: { env, ctx } },
      }),
    ).resolves.toEqual({ comments: [], unavailable: false });
    expect(updatePostgresCommunityComment).toHaveBeenCalledWith(env, 1, "reply-1", "edited", "private");
    expect(getTimelineContent).not.toHaveBeenCalled();
    expect(getRecruitmentGroupByUidStrict).not.toHaveBeenCalled();
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });
});
