import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { CommunityFeedPost } from "~/models/community";
import { enrichCommunityFeedPosts } from "~/models/community-feed";
import { getAllStudentsMap } from "~/models/student";
import { getGradingTagsByGradingUids } from "~/models/student-grading-tag";
import { getTimelineContentsByUids } from "~/models/timeline-content";
import { RecruitmentRepository } from "~/repositories/recruitment";

jest.mock("~/models/student", () => ({
  getAllStudentsMap: jest.fn(),
}));

jest.mock("~/models/student-grading-tag", () => ({
  getGradingTagsByGradingUids: jest.fn(),
}));

jest.mock("~/models/timeline-content", () => ({
  getTimelineContentsByUids: jest.fn(),
}));

const mockGetByUids = jest.fn<() => Promise<unknown[]>>();

jest.mock("~/repositories/recruitment", () => ({
  RecruitmentRepository: jest.fn(() => ({
    getByUids: mockGetByUids,
  })),
}));

type PreparedStatement = {
  sql: string;
  params: unknown[];
};

type FakeRecruitmentResultRow = {
  id: number;
  uid: string;
  userId: number;
  recruitmentGroupUid: string;
  contentUid: string | null;
  completedAt: string | null;
  recruitedStudents: string;
  exchangedStudents: string;
  tier3Count?: number | null;
  trial: number | null;
  rawResult: string | null;
  commentPostUid: string | null;
  createdAt: string;
  updatedAt: string;
};

class FakeD1Statement {
  private params: unknown[] = [];

  constructor(
    private readonly db: FakeCommunityFeedD1Database,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]): FakeD1Statement {
    this.params = params;
    return this;
  }

  async raw(): Promise<unknown[][]> {
    return this.db.selectRows(this.sql, this.params);
  }

  async all(): Promise<{ results: unknown[][] }> {
    return { results: this.db.selectRows(this.sql, this.params) };
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    this.db.executedStatements.push({ sql: this.sql, params: this.params });
    return { success: true, meta: { changes: 0 } };
  }
}

class FakeCommunityFeedD1Database {
  recruitmentResults: FakeRecruitmentResultRow[] = [];
  executedStatements: PreparedStatement[] = [];

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  selectRows(sql: string, params: unknown[]): unknown[][] {
    const normalizedSql = sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();

    if (normalizedSql.includes("from recruitment_results")) {
      const commentPostUids = params.filter((param): param is string => typeof param === "string");
      return this.recruitmentResults
        .filter((result) => result.commentPostUid !== null && commentPostUids.includes(result.commentPostUid))
        .map((result) => [
          result.userId,
          result.recruitedStudents,
          result.tier3Count ?? null,
          result.trial,
          result.commentPostUid,
        ]);
    }

    throw new Error(`Unexpected SELECT SQL: ${sql}\nparams: ${JSON.stringify(params)}`);
  }
}

const mockedGetAllStudentsMap = getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>;
const mockedGetGradingTagsByGradingUids = getGradingTagsByGradingUids as jest.MockedFunction<
  typeof getGradingTagsByGradingUids
>;
const mockedGetTimelineContentsByUids = getTimelineContentsByUids as jest.MockedFunction<
  typeof getTimelineContentsByUids
>;
const mockedRecruitmentRepository = RecruitmentRepository as jest.MockedClass<typeof RecruitmentRepository>;

function createEnv(db: FakeCommunityFeedD1Database): Env {
  return { DB: db } as unknown as Env;
}

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
});

describe("enrichCommunityFeedPosts", () => {
  it("adds recruitment result stats while excluding exchanged students from displayed counts", async () => {
    const db = new FakeCommunityFeedD1Database();
    db.recruitmentResults.push({
      id: 1,
      uid: "result-1",
      userId: 1,
      recruitmentGroupUid: "group-1",
      contentUid: "content-1",
      completedAt: "2026-06-08T00:00:00.000Z",
      recruitedStudents: JSON.stringify([
        { studentUid: "hina", tier: 3, pickup: true },
        { studentUid: "aru", tier: 3, pickup: false },
        { studentUid: "serika", tier: 2, pickup: false },
      ]),
      exchangedStudents: JSON.stringify([{ studentUid: "hoshino", tier: 3, pickup: true }]),
      trial: 120,
      rawResult: null,
      commentPostUid: "post-1",
      createdAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T00:00:00.000Z",
    });
    mockedGetAllStudentsMap.mockResolvedValue({});
    mockedGetGradingTagsByGradingUids.mockResolvedValue({});
    mockedGetTimelineContentsByUids.mockResolvedValue([
      {
        uid: "content-1",
        name: "무장 히마리 픽업",
        recruitmentGroupUid: "group-1",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByUids>>);
    mockGetByUids.mockResolvedValue([
      {
        uid: "group-1",
        recruitments: [
          { pickup: true, student: { uid: "hina", name: "히나" } },
          { pickup: true, student: { uid: "hoshino", name: "호시노" } },
        ],
      },
    ]);

    const enriched = await enrichCommunityFeedPosts(createEnv(db), [createRecruitmentResultPost()]);

    expect(mockedRecruitmentRepository).toHaveBeenCalledWith(createEnv(db));
    expect(enriched.posts[0].recruitmentStats).toEqual({
      totalTrial: 120,
      tier3Count: 2,
      pickupCount: 1,
    });
  });

  it("uses shared recruitment result counting rules for given pickups and stored tier drift", async () => {
    const db = new FakeCommunityFeedD1Database();
    db.recruitmentResults.push({
      id: 1,
      uid: "result-1",
      userId: 1,
      recruitmentGroupUid: "main-story-decagrammaton-3-2",
      contentUid: "main-story-decagrammaton-3-2",
      completedAt: "2026-06-08T00:00:00.000Z",
      recruitedStudents: JSON.stringify([
        { studentUid: "20054", tier: 3, pickup: false },
        { studentUid: "10070", tier: 3, pickup: false },
        { studentUid: "10127", tier: 3, pickup: false },
        { studentUid: "10035", tier: 3, pickup: false },
        { studentUid: "10121", tier: 3, pickup: false },
        { studentUid: "10036", tier: 3, pickup: false },
        { studentUid: "20039", tier: 3, pickup: false },
        { studentUid: "16019", tier: 3, pickup: true },
      ]),
      exchangedStudents: JSON.stringify([{ studentUid: "10133", tier: 3, pickup: true }]),
      trial: 200,
      rawResult: null,
      commentPostUid: "post-1",
      createdAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T00:00:00.000Z",
    });
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
    mockGetByUids.mockResolvedValue([
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

    const enriched = await enrichCommunityFeedPosts(createEnv(db), [createRecruitmentResultPost()]);

    expect(enriched.posts[0].recruitmentStats).toEqual({
      totalTrial: 200,
      tier3Count: 7,
      pickupCount: 1,
    });
    expect(enriched.posts[0].pickupStudents.map((student) => student.uid)).toEqual(["10133", "20054"]);
  });
});
