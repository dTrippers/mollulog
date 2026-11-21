import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { InvalidRaidRecordError, type RaidRecord } from "~/domain/raid-record";
import { Terrain } from "~/graphql/graphql";
import type { RaidRecordSeason } from "~/models/raid-record";

const mockGetActiveSensei = jest.fn<() => Promise<{ id: number } | null>>();
const mockGetSeasons = jest.fn<(env: unknown, server: string) => Promise<RaidRecordSeason[]>>();
const mockApplyChartScore = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLogError = jest.fn();

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: () => mockGetActiveSensei(),
}));
jest.mock("~/models/raid-record", () => ({
  getRaidRecordSeasons: (...args: [unknown, string]) => mockGetSeasons(...args),
  applyRaidRecordChartScore: (...args: unknown[]) => mockApplyChartScore(...args),
}));
jest.mock("~/lib/observability.server", () => ({
  getLogger: () => ({ error: (...args: unknown[]) => mockLogError(...args) }),
}));

import { action } from "~/routes/api.raid-records.chart-score";

const env = {} as Env;

const startedSeason: RaidRecordSeason = {
  server: "kr",
  raidType: "elimination",
  seasonIndex: 35,
  boss: { uid: "hod", name: "호드" },
  terrain: Terrain.Indoor,
  startAt: "2020-01-01T00:00:00.000Z",
  endAt: null,
  displayDefenseTypes: [],
  scoreDefenseTypes: [{ defenseType: "heavy", maxDifficulty: "torment" }],
  counterpartSeasonIndex: 35,
  rankConfirmAt: null,
};

const savedRecord: RaidRecord = {
  uid: "record-1",
  userId: 1,
  server: "kr",
  raidType: "elimination",
  seasonIndex: 35,
  scores: [{ defenseType: "heavy", score: 40_000_000 }],
  rank: null,
  rankRecordedAt: null,
  memo: "",
  parties: [],
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

const validBody = { server: "kr", raidType: "elimination", seasonIndex: 35, defenseType: "heavy", score: 40_000_000 };

async function callAction(body: unknown, method = "POST") {
  const result = (await action({
    request: new Request("https://mollulog.net/api/raid-records/chart-score", {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
    context: { cloudflare: { env, ctx: {} } },
    params: {},
  } as never)) as unknown as { data: unknown; init: ResponseInit | null };
  return { status: result.init?.status ?? 200, body: result.data };
}

beforeEach(() => {
  mockGetActiveSensei.mockReset().mockResolvedValue({ id: 1 });
  mockGetSeasons.mockReset().mockResolvedValue([startedSeason]);
  mockApplyChartScore.mockReset().mockResolvedValue({ kind: "saved", record: savedRecord });
  mockLogError.mockReset();
});

describe("api.raid-records.chart-score", () => {
  it("saves the score to the signed-in Sensei's record and returns the record line's view", async () => {
    await expect(callAction(validBody)).resolves.toEqual({
      status: 200,
      body: {
        ok: true,
        record: {
          uid: "record-1",
          scores: [{ defenseType: "heavy", score: 40_000_000 }],
          totalScore: 40_000_000,
          rank: null,
          rankStatus: "missing",
          scoreOnly: true,
        },
      },
    });
    expect(mockGetSeasons).toHaveBeenCalledWith(env, "kr");
    expect(mockApplyChartScore).toHaveBeenCalledWith(env, 1, startedSeason, "heavy", 40_000_000, { ctx: {} });
  });

  it("returns no record once the cleared score removed it", async () => {
    mockApplyChartScore.mockResolvedValue({ kind: "deleted" });
    await expect(callAction({ ...validBody, score: null })).resolves.toEqual({
      status: 200,
      body: { ok: true, record: null },
    });
    expect(mockApplyChartScore).toHaveBeenCalledWith(env, 1, startedSeason, "heavy", null, { ctx: {} });
  });

  it("requires a signed-in Sensei", async () => {
    mockGetActiveSensei.mockResolvedValue(null);
    await expect(callAction(validBody)).resolves.toEqual({
      status: 401,
      body: { ok: false, message: "로그인이 필요해요." },
    });
    expect(mockApplyChartScore).not.toHaveBeenCalled();
  });

  it("rejects a malformed request", async () => {
    const invalid = { ok: false, message: "요청을 확인하지 못했어요." };
    await expect(callAction("{")).resolves.toEqual({ status: 400, body: invalid });
    await expect(callAction([validBody])).resolves.toEqual({ status: 400, body: invalid });
    await expect(callAction({ ...validBody, server: "cn" })).resolves.toEqual({ status: 400, body: invalid });
    await expect(callAction({ ...validBody, raidType: "joint_firing_drill" })).resolves.toEqual({
      status: 400,
      body: invalid,
    });
    await expect(callAction({ ...validBody, seasonIndex: "35" })).resolves.toEqual({ status: 400, body: invalid });
    await expect(callAction({ ...validBody, defenseType: "unknown" })).resolves.toEqual({ status: 400, body: invalid });
    await expect(callAction({ ...validBody, score: -1 })).resolves.toEqual({
      status: 400,
      body: { ok: false, message: "점수를 확인해 주세요." },
    });
    expect(mockApplyChartScore).not.toHaveBeenCalled();
  });

  it("rejects a season that has not started or does not exist", async () => {
    const notRecordable = { status: 400, body: { ok: false, message: "기록할 수 있는 시즌이 아니에요." } };
    mockGetSeasons.mockResolvedValue([{ ...startedSeason, startAt: "2999-01-01T00:00:00.000Z" }]);
    await expect(callAction(validBody)).resolves.toEqual(notRecordable);
    mockGetSeasons.mockResolvedValue([]);
    await expect(callAction(validBody)).resolves.toEqual(notRecordable);
    expect(mockApplyChartScore).not.toHaveBeenCalled();
  });

  it("returns a validation message as a 400 and hides other failures behind a 500", async () => {
    mockApplyChartScore.mockRejectedValueOnce(
      new InvalidRaidRecordError("이 시즌에서 달성할 수 있는 최대 점수(40,348,000)보다 높아요."),
    );
    await expect(callAction(validBody)).resolves.toEqual({
      status: 400,
      body: { ok: false, message: "이 시즌에서 달성할 수 있는 최대 점수(40,348,000)보다 높아요." },
    });

    mockApplyChartScore.mockRejectedValueOnce(new Error("connection reset by peer"));
    await expect(callAction(validBody)).resolves.toEqual({
      status: 500,
      body: { ok: false, message: "저장하지 못했어요." },
    });
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  it("accepts only POST", async () => {
    await expect(callAction(null, "GET")).resolves.toEqual({
      status: 405,
      body: { ok: false, message: "요청을 확인하지 못했어요." },
    });
  });
});
