import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { getPostgresRecruitmentStatsRows } from "~/db/postgres/community";
import type { CommunityFeedPost } from "~/models/community";
import { getRecruitmentGroupsByUids } from "~/models/recruitment";
import { getAllStudentsMap } from "~/models/student";
import { getGradingTagsByGradingUids } from "~/models/student-grading-tag.server";
import { getTimelineContentsByUids } from "~/models/timeline-content.server";
import { enrichCommunityFeedPosts } from "~/views/community.server";

jest.mock("~/models/student", () => ({
  getAllStudentsMap: jest.fn(),
}));

jest.mock("~/models/student-grading-tag.server", () => ({
  getGradingTagsByGradingUids: jest.fn(),
}));

jest.mock("~/models/timeline-content.server", () => ({
  getTimelineContentsByUids: jest.fn(),
}));

jest.mock("~/models/recruitment", () => ({
  getRecruitmentGroupsByUids: jest.fn(),
}));
jest.mock("~/db/postgres/community", () => ({
  getPostgresRecruitmentStatsRows: jest.fn(),
}));

const mockedGetPostgresRecruitmentStatsRows = getPostgresRecruitmentStatsRows as jest.MockedFunction<
  typeof getPostgresRecruitmentStatsRows
>;
const mockedGetAllStudentsMap = getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>;
const mockedGetGradingTagsByGradingUids = getGradingTagsByGradingUids as jest.MockedFunction<
  typeof getGradingTagsByGradingUids
>;
const mockedGetTimelineContentsByUids = getTimelineContentsByUids as jest.MockedFunction<
  typeof getTimelineContentsByUids
>;
const mockedGetRecruitmentGroupsByUids = getRecruitmentGroupsByUids as unknown as jest.MockedFunction<
  (...args: unknown[]) => Promise<unknown[]>
>;

const env = {} as Env;

function createRecruitmentResultPost(): CommunityFeedPost {
  return {
    uid: "post-1",
    postType: "recruitment_result",
    origin: "user",
    title: null,
    visibility: "public",
    pinned: false,
    subjectStudentUid: null,
    subjectContentUid: "content-1",
    subjectRaidType: null,
    subjectSeasonIndex: null,
    blocks: [{ type: "plaintext", text: "모집 코멘트" }],
    sourceName: null,
    sourceUrl: null,
    sourceMetadata: {},
    displayAt: "2026-06-08T00:00:00.000Z",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
    author: { id: 1, username: "sensei", profileStudentId: null },
    liked: false,
    likeCount: 0,
    comments: [],
  };
}

afterEach(() => {
  jest.clearAllMocks();
  mockedGetPostgresRecruitmentStatsRows.mockResolvedValue([]);
});

describe("enrichCommunityFeedPosts", () => {
  it("routes walkthrough likes to the source-owned timeline endpoint", async () => {
    mockedGetAllStudentsMap.mockResolvedValue({});
    mockedGetGradingTagsByGradingUids.mockResolvedValue({});
    mockedGetTimelineContentsByUids.mockResolvedValue([]);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([]);
    const post: CommunityFeedPost = {
      ...createRecruitmentResultPost(),
      uid: "feed-projection-1",
      postType: "walkthrough_timeline",
      subjectContentUid: null,
      blocks: [
        {
          type: "walkthrough_timeline",
          timelineUid: "timeline-1",
          bossUid: "boss-1",
          terrain: "indoor",
          defenseType: "heavy",
          maxDifficulty: "torment",
          partyCount: 1,
          usedStudentUids: [],
        },
      ],
    };

    const enriched = await enrichCommunityFeedPosts(env, [post], { includeEngagement: false });

    expect(enriched.posts[0].likeTarget).toEqual({
      uid: "timeline-1",
      action: "/api/timelines/timeline-1/likes",
    });
  });

  it("adds recruitment result stats while excluding exchanged students from displayed counts", async () => {
    mockedGetPostgresRecruitmentStatsRows.mockResolvedValue([
      {
        userId: 1,
        recruitedStudents: [
          { studentUid: "hina", tier: 3, pickup: true },
          { studentUid: "aru", tier: 3, pickup: false },
          { studentUid: "serika", tier: 2, pickup: false },
        ],
        trial: 120,
        commentPostUid: "post-1",
        tier3Count: null,
      },
    ]);
    mockedGetAllStudentsMap.mockResolvedValue({});
    mockedGetGradingTagsByGradingUids.mockResolvedValue({});
    mockedGetTimelineContentsByUids.mockResolvedValue([
      {
        uid: "content-1",
        name: "무장 히마리 픽업",
        recruitmentGroupUid: "group-1",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByUids>>);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([
      {
        uid: "group-1",
        recruitments: [
          { pickup: true, student: { uid: "hina", name: "히나" } },
          { pickup: true, student: { uid: "hoshino", name: "호시노" } },
        ],
      },
    ]);

    const enriched = await enrichCommunityFeedPosts(env, [createRecruitmentResultPost()]);

    expect(mockedGetRecruitmentGroupsByUids).toHaveBeenCalledWith(env, ["group-1"]);
    expect(enriched.posts[0].recruitmentStats).toEqual({
      totalTrial: 120,
      tier3Count: 2,
      pickupCount: 1,
    });
  });

  it("uses shared recruitment result counting rules for given pickups and stored tier drift", async () => {
    mockedGetPostgresRecruitmentStatsRows.mockResolvedValue([
      {
        userId: 1,
        recruitedStudents: [
          { studentUid: "20054", tier: 3, pickup: false },
          { studentUid: "10070", tier: 3, pickup: false },
          { studentUid: "10127", tier: 3, pickup: false },
          { studentUid: "10035", tier: 3, pickup: false },
          { studentUid: "10121", tier: 3, pickup: false },
          { studentUid: "10036", tier: 3, pickup: false },
          { studentUid: "20039", tier: 3, pickup: false },
          { studentUid: "16019", tier: 3, pickup: true },
        ],
        trial: 200,
        commentPostUid: "post-1",
        tier3Count: null,
      },
    ]);
    mockedGetAllStudentsMap.mockResolvedValue({
      "10035": { uid: "10035", name: "우이", initialTier: 3 },
      "10036": { uid: "10036", name: "히나타", initialTier: 3 },
      "10070": { uid: "10070", name: "미나", initialTier: 3 },
      "10121": { uid: "10121", name: "유카리(수영복)", initialTier: 3 },
      "10127": { uid: "10127", name: "미요", initialTier: 3 },
      "10133": { uid: "10133", name: "리오(무장)", initialTier: 3 },
      "16019": { uid: "16019", name: "토키(무장)", initialTier: 1 },
      "20039": { uid: "20039", name: "키사키", initialTier: 3 },
      "20054": { uid: "20054", name: "히마리(무장)", initialTier: 3 },
    } as unknown as Awaited<ReturnType<typeof getAllStudentsMap>>);
    mockedGetGradingTagsByGradingUids.mockResolvedValue({});
    mockedGetTimelineContentsByUids.mockResolvedValue([
      {
        uid: "content-1",
        name: "1부 Ex. 데카그라마톤 편",
        recruitmentGroupUid: "main-story-decagrammaton-3-2",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByUids>>);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([
      {
        uid: "main-story-decagrammaton-3-2",
        recruitmentType: "usual",
        recruitments: [
          {
            pickup: true,
            recruitmentType: "limited",
            student: { uid: "10133", name: "리오(무장)", initialTier: 3 },
          },
          {
            pickup: true,
            recruitmentType: "limited",
            student: { uid: "20054", name: "히마리(무장)", initialTier: 3 },
          },
          {
            pickup: true,
            recruitmentType: "given",
            student: { uid: "16019", name: "토키(무장)", initialTier: 1 },
          },
        ],
      },
    ]);

    const enriched = await enrichCommunityFeedPosts(env, [createRecruitmentResultPost()]);

    expect(enriched.posts[0].recruitmentStats).toEqual({
      totalTrial: 200,
      tier3Count: 7,
      pickupCount: 1,
    });
    expect(enriched.posts[0].pickupStudents.map((student) => student.uid)).toEqual(["10133", "20054"]);
  });

  it("restricts pickupStudents to the subject event's recruitmentStudentUids when a group is shared", async () => {
    mockedGetAllStudentsMap.mockResolvedValue({});
    mockedGetGradingTagsByGradingUids.mockResolvedValue({});
    mockedGetTimelineContentsByUids.mockResolvedValue([
      {
        uid: "content-1",
        name: "이벤트#1",
        recruitmentGroupUid: "shared-group",
        recruitmentStudentUids: ["a"],
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByUids>>);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([
      {
        uid: "shared-group",
        recruitments: [
          { pickup: true, recruitmentType: "limited", student: { uid: "a", name: "학생A" } },
          { pickup: true, recruitmentType: "limited", student: { uid: "b", name: "학생B" } },
        ],
      },
    ]);

    const enriched = await enrichCommunityFeedPosts(env, [createRecruitmentResultPost()]);

    expect(enriched.posts[0].pickupStudents.map((student) => student.uid)).toEqual(["a"]);
  });
});
