import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { RaidRepository } from "../../../app/repositories/raid";
import { getAllRaidSchedules, getRaidSchedule, getRaidScheduleBySeasonIndex } from "~/models/raid";

jest.mock("~/models/raid", () => ({
  getAllRaidSchedules: jest.fn(),
  getRaidSchedule: jest.fn(),
  getRaidScheduleBySeasonIndex: jest.fn(),
  raidTypeFromParam: (param: string) => {
    if (param === "total-assault") return "total_assault";
    if (param === "grand-assault") return "elimination";
    return param;
  },
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
  const bind = jest.fn((_contentUid: string) => ({ first }));
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
    bind,
    prepare,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(getAllRaidSchedules).mockReset();
  jest.mocked(getRaidSchedule).mockReset();
  jest.mocked(getRaidScheduleBySeasonIndex).mockReset();
});

describe("RaidRepository", () => {
  it("resolves a schedule by route raidType and seasonIndex", async () => {
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
      videos: { pageInfo: { hasNextPage: false } },
    };
    jest.mocked(getRaidScheduleBySeasonIndex).mockResolvedValue(schedule as never);

    await expect(repository.getByTypeAndSeason("grand-assault", 42)).resolves.toEqual(schedule);

    expect(getRaidScheduleBySeasonIndex).toHaveBeenCalledWith(env, "gl", 42, false);
  });

  it("returns null when season lookup resolves to a different raidType", async () => {
    const { env } = createEnv();
    const repository = new RaidRepository(env);
    jest.mocked(getRaidScheduleBySeasonIndex).mockResolvedValue({
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
      videos: { pageInfo: { hasNextPage: false } },
    } as never);

    await expect(repository.getByTypeAndSeason("grand-assault", 42)).resolves.toBeNull();
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
    const { env, prepare, bind, first } = createEnv({
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
    expect(bind).toHaveBeenCalledWith("legacy-elimination-77");
    expect(first).toHaveBeenCalled();
    expect(getRaidSchedule).toHaveBeenCalledWith(env, "gl_elimination_77", false);
  });
});
