import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { RaidScheduleVideosDocument, VideoSortEnum } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { RaidRepository } from "../../../app/repositories/raid";
import { getAllRaidSchedules, getRaidSchedule } from "~/models/raid";

jest.mock("~/models/raid", () => ({
  getAllRaidSchedules: jest.fn(),
  getRaidSchedule: jest.fn(),
  raidTypeFromParam: (param: string) => {
    if (param === "total-assault") return "total_assault";
    if (param === "grand-assault") return "elimination";
    return param;
  },
}));

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

type RepositoryEnv = ConstructorParameters<typeof RaidRepository>[0];

type TimelineRow = {
  uid: string;
  contentType: string;
  contentUid: string | null;
  startAt: string;
  endAt: string | null;
} | null;

function createEnv(row: TimelineRow = null) {
  const first = jest.fn(async () => row);
  const all = jest.fn(async () => (row ? [row] : []));
  const raw = jest.fn(async () => (row ? [[row.uid, row.contentType, row.contentUid, row.startAt, row.endAt]] : []));
  const run = jest.fn(async () => undefined);
  const bind = jest.fn((..._args: unknown[]) => ({ first, all, raw, run }));
  const prepare = jest.fn(() => ({ bind }));

  return {
    env: {
      DB: { prepare },
      KV_USERDATA: {
        get: jest.fn(async () => null),
        put: jest.fn(async () => undefined),
        delete: jest.fn(async () => undefined),
        list: jest.fn(async () => ({ keys: [] })),
      },
    } as unknown as RepositoryEnv,
    first,
    all,
    raw,
    run,
    bind,
    prepare,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(getAllRaidSchedules).mockReset();
  jest.mocked(getRaidSchedule).mockReset();
  jest.mocked(runQuery).mockReset();
});

describe("RaidRepository", () => {
  it("finds a summary by route raidType and seasonIndex from the cached schedule list", async () => {
    const { env } = createEnv();
    const repository = new RaidRepository(env);
    const schedule = {
      uid: "gl_elimination_42",
      raidType: "elimination",
      seasonIndex: 42,
      raidBoss: { uid: "hovercraft", name: "호버크래프트" },
      terrain: "urban",
      attackType: null,
      defenseTypes: [],
      jpSchedule: { uid: "jp_elimination_49", seasonIndex: 49 },
      startAt: new Date("2026-04-01T03:00:00Z"),
      endAt: new Date("2026-04-08T03:00:00Z"),
    };
    jest.mocked(getAllRaidSchedules).mockResolvedValue([schedule] as never);

    await expect(repository.findSummaryByTypeAndSeason("grand-assault", 42)).resolves.toEqual(schedule);

    expect(getAllRaidSchedules).toHaveBeenCalledWith(env, false);
    expect(getRaidSchedule).not.toHaveBeenCalled();
  });

  it("resolves a schedule by route raidType and seasonIndex via the matching summary uid", async () => {
    const { env } = createEnv();
    const repository = new RaidRepository(env);
    const summary = {
      uid: "gl_elimination_42",
      raidType: "elimination",
      seasonIndex: 42,
      raidBoss: { uid: "hovercraft", name: "호버크래프트" },
      terrain: "urban",
      attackType: null,
      defenseTypes: [],
      jpSchedule: { uid: "jp_elimination_49", seasonIndex: 49 },
      startAt: new Date("2026-04-01T03:00:00Z"),
      endAt: new Date("2026-04-08T03:00:00Z"),
    };
    const schedule = {
      ...summary,
      videos: { pageInfo: { hasNextPage: false } },
    };
    jest.mocked(getAllRaidSchedules).mockResolvedValue([summary] as never);
    jest.mocked(getRaidSchedule).mockResolvedValue(schedule as never);

    await expect(repository.getByTypeAndSeason("grand-assault", 42)).resolves.toEqual(schedule);

    expect(getAllRaidSchedules).toHaveBeenCalledWith(env, false);
    expect(getRaidSchedule).toHaveBeenCalledWith(env, "gl_elimination_42", false);
  });

  it("returns null when the matching season exists only for a different raidType", async () => {
    const { env } = createEnv();
    const repository = new RaidRepository(env);
    jest.mocked(getAllRaidSchedules).mockResolvedValue([
      {
        uid: "gl_total_assault_42",
        raidType: "total_assault",
        seasonIndex: 42,
        raidBoss: { uid: "binah", name: "비나" },
        terrain: "outdoor",
        attackType: null,
        defenseTypes: [],
        jpSchedule: { uid: "jp_total_assault_49", seasonIndex: 49 },
        startAt: new Date("2026-04-01T03:00:00Z"),
        endAt: new Date("2026-04-08T03:00:00Z"),
      },
    ] as never);

    await expect(repository.getByTypeAndSeason("grand-assault", 42)).resolves.toBeNull();
    expect(getRaidSchedule).not.toHaveBeenCalled();
  });

  it("picks the elimination schedule when total assault and elimination share the same seasonIndex", async () => {
    const { env } = createEnv();
    const repository = new RaidRepository(env);
    const totalAssaultSummary = {
      uid: "gl_total_assault_42",
      raidType: "total_assault",
      seasonIndex: 42,
      raidBoss: { uid: "binah", name: "비나" },
      terrain: "outdoor",
      attackType: null,
      defenseTypes: [],
      jpSchedule: { uid: "jp_total_assault_49", seasonIndex: 49 },
      startAt: new Date("2026-04-01T03:00:00Z"),
      endAt: new Date("2026-04-08T03:00:00Z"),
    };
    const eliminationSummary = {
      uid: "gl_elimination_42",
      raidType: "elimination",
      seasonIndex: 42,
      raidBoss: { uid: "hovercraft", name: "호버크래프트" },
      terrain: "urban",
      attackType: null,
      defenseTypes: [],
      jpSchedule: { uid: "jp_elimination_49", seasonIndex: 49 },
      startAt: new Date("2026-04-01T03:00:00Z"),
      endAt: new Date("2026-04-08T03:00:00Z"),
    };
    const eliminationDetail = {
      ...eliminationSummary,
      videos: { pageInfo: { hasNextPage: false } },
    };
    jest.mocked(getAllRaidSchedules).mockResolvedValue([totalAssaultSummary, eliminationSummary] as never);
    jest.mocked(getRaidSchedule).mockResolvedValue(eliminationDetail as never);

    await expect(repository.getByTypeAndSeason("grand-assault", 42)).resolves.toEqual(eliminationDetail);
    expect(getRaidSchedule).toHaveBeenCalledWith(env, "gl_elimination_42", false);
  });

  it("finds a legacy raid schedule by content type and timeline dates", async () => {
    const { env } = createEnv();
    const repository = new RaidRepository(env);
    const schedule = {
      uid: "gl_total_assault_99",
      raidType: "total_assault",
      seasonIndex: 99,
      raidBoss: { uid: "binah", name: "비나" },
      terrain: "outdoor",
      attackType: null,
      defenseTypes: [],
      jpSchedule: { uid: "jp_total_assault_106", seasonIndex: 106 },
      startAt: new Date("2026-05-01T03:00:00Z"),
      endAt: new Date("2026-05-08T03:00:00Z"),
    };
    jest.mocked(getAllRaidSchedules).mockResolvedValue([schedule] as never);

    await expect(
      repository.findSummaryByContent({
        contentType: "total_assault",
        contentUid: "legacy-total-assault-99",
        startAt: new Date("2026-05-01T03:00:00Z"),
        endAt: new Date("2026-05-08T03:00:00Z"),
      }),
    ).resolves.toEqual(schedule);

    expect(getAllRaidSchedules).toHaveBeenCalledWith(env, false);
    expect(getRaidSchedule).not.toHaveBeenCalled();
  });

  it("resolves an old raid uid through timeline_contents and loads the matched schedule", async () => {
    const { env, prepare, bind, raw } = createEnv({
      uid: "timeline-raid-77",
      contentType: "elimination",
      contentUid: "legacy-elimination-77",
      startAt: "2026-06-10T03:00:00Z",
      endAt: "2026-06-17T03:00:00Z",
    });
    const repository = new RaidRepository(env);
    const summary = {
      uid: "gl_elimination_77",
      raidType: "elimination",
      seasonIndex: 77,
      raidBoss: { uid: "shirokuro", name: "시로쿠로" },
      terrain: "indoor",
      attackType: null,
      defenseTypes: [],
      jpSchedule: { uid: "jp_elimination_84", seasonIndex: 84 },
      startAt: new Date("2026-06-10T03:00:00Z"),
      endAt: new Date("2026-06-17T03:00:00Z"),
    };
    const detail = {
      ...summary,
      videos: { pageInfo: { hasNextPage: true } },
    };
    jest.mocked(getAllRaidSchedules).mockResolvedValue([summary] as never);
    jest.mocked(getRaidSchedule).mockResolvedValue(detail as never);

    await expect(repository.findByLegacyContentUid("legacy-elimination-77")).resolves.toEqual(detail);

    expect(prepare).toHaveBeenCalled();
    expect(bind).toHaveBeenCalled();
    expect(raw).toHaveBeenCalled();
    expect(getRaidSchedule).toHaveBeenCalledWith(env, "gl_elimination_77", false);
  });

  it("falls back to legacy content uid when resolving a party raid reference", async () => {
    const { env } = createEnv({
      uid: "timeline-raid-77",
      contentType: "elimination",
      contentUid: "legacy-elimination-77",
      startAt: "2026-06-10T03:00:00Z",
      endAt: "2026-06-17T03:00:00Z",
    });
    const repository = new RaidRepository(env);
    const summary = {
      uid: "gl_elimination_77",
      raidType: "elimination",
      seasonIndex: 77,
      raidBoss: { uid: "shirokuro", name: "시로쿠로" },
      terrain: "indoor",
      attackType: null,
      defenseTypes: [],
      jpSchedule: { uid: "jp_elimination_84", seasonIndex: 84 },
      startAt: new Date("2026-06-10T03:00:00Z"),
      endAt: new Date("2026-06-17T03:00:00Z"),
    };
    jest.mocked(getAllRaidSchedules).mockResolvedValue([summary] as never);

    await expect(
      repository.findSummaryByPartyReference({
        raidType: null,
        seasonIndex: null,
        legacyRaidContentUid: "legacy-elimination-77",
      }),
    ).resolves.toEqual(summary);
  });

  it("loads raid videos through BAQL and normalizes the response", async () => {
    const { env } = createEnv();
    const repository = new RaidRepository(env);
    jest.mocked(runQuery).mockResolvedValue({
      data: {
        raidSchedule: {
          videos: {
            pageInfo: {
              hasNextPage: true,
              hasPreviousPage: false,
              startCursor: "cursor:1",
              endCursor: "cursor:2",
            },
            edges: [
              {
                node: {
                  id: "video-1",
                  title: "시로쿠로 토먼트",
                  score: 27500000,
                  youtubeId: "abc123",
                  thumbnailUrl: "https://img.youtube.com/vi/abc123/maxresdefault.jpg",
                  publishedAt: new Date("2026-04-01T03:00:00Z"),
                },
              },
              { node: null },
            ],
          },
        },
      },
      error: undefined,
    } as never);

    await expect(
      repository.getVideos("gl_elimination_42", {
        first: 12,
        after: "cursor:1",
        sort: VideoSortEnum.PublishedAtDesc,
      }),
    ).resolves.toEqual({
      videos: [
        {
          id: "video-1",
          title: "시로쿠로 토먼트",
          score: 27500000,
          youtubeId: "abc123",
          thumbnailUrl: "https://img.youtube.com/vi/abc123/maxresdefault.jpg",
          publishedAt: "2026-04-01T03:00:00.000Z",
        },
      ],
      pageInfo: {
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: "cursor:1",
        endCursor: "cursor:2",
      },
    });

    expect(runQuery).toHaveBeenCalledWith(RaidScheduleVideosDocument, {
      uid: "gl_elimination_42",
      first: 12,
      after: "cursor:1",
      sort: VideoSortEnum.PublishedAtDesc,
    });
  });
});
