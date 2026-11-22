/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";
import {
  formatChartScoreInput,
  parseChartScoreInput,
  useRaidChartMyScore,
} from "~/routes/raids.$raidType.$seasonIndex._components/use-raid-chart-my-score";
import type { RaidChartRecordContextView, RaidChartRecordView } from "~/views/raid-records";

const STORAGE_KEY = "raid-clear-time-distribution:my-score:elimination:35:heavy";

function chartRecord(overrides: Partial<RaidChartRecordView> = {}): RaidChartRecordView {
  return {
    uid: "kr-record",
    scores: [{ defenseType: "heavy", score: 40_000_000 }],
    totalScore: 40_000_000,
    rank: 1200,
    rankStatus: "provisional",
    scoreOnly: false,
    ...overrides,
  };
}

function context(overrides: Partial<RaidChartRecordContextView> = {}): RaidChartRecordContextView {
  return {
    username: "sensei",
    raidType: "elimination",
    kr: { server: "kr", seasonIndex: 35, started: true, scoreDefenseTypes: ["heavy", "elastic", "light"], record: chartRecord() },
    jp: null,
    ...overrides,
  };
}

type FetchCall = { url: string; body: Record<string, unknown> };
let fetchCalls: FetchCall[];
let respond: (call: FetchCall) => Promise<Response>;

// jsdom has no Response; the hook reads only the status and the JSON body.
function jsonResponse(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body } as unknown as Response;
}

function renderMyScore(initial: { context: RaidChartRecordContextView | null; defenseType?: string }) {
  return renderHook(
    ({ context: hookContext, defenseType }) => useRaidChartMyScore({ storageKey: STORAGE_KEY, context: hookContext, defenseType }),
    { initialProps: { context: initial.context, defenseType: initial.defenseType ?? "heavy" } },
  );
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
  fetchCalls = [];
  respond = async ({ body }) =>
    jsonResponse(200, {
      ok: true,
      record: chartRecord({ scores: [{ defenseType: body.defenseType as "heavy", score: body.score as number }] }),
    });
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> };
    fetchCalls.push(call);
    return respond(call);
  }) as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("chart score input", () => {
  it("reads digits only and formats them with separators", () => {
    expect(parseChartScoreInput("40,000,000점")).toBe(40_000_000);
    expect(parseChartScoreInput("0")).toBeNull();
    expect(parseChartScoreInput("")).toBeNull();
    expect(formatChartScoreInput("40000000")).toBe("40,000,000");
  });
});

describe("useRaidChartMyScore in the browser-only modes", () => {
  it("keeps a guest's score in localStorage as before records", async () => {
    window.localStorage.setItem(STORAGE_KEY, "30,000,000");
    const { result } = renderMyScore({ context: null });

    expect(result.current.mode).toBe("local");
    expect(result.current.value).toBe("30,000,000");
    act(() => result.current.onChange("31000000"));
    await advance(2000);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("31,000,000");
    expect(fetchCalls).toEqual([]);
  });

  it("keeps the score in the browser for a season the Korean server has not started", () => {
    const { result } = renderMyScore({
      context: context({ kr: { server: "kr", seasonIndex: 40, started: false, scoreDefenseTypes: [], record: null } }),
    });

    expect(result.current.mode).toBe("unstarted");
    act(() => result.current.onChange("1"));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("keeps the score in the browser for a defense type the record does not take", () => {
    const { result } = renderMyScore({ context: context(), defenseType: "special" });
    expect(result.current.mode).toBe("local");
  });
});

describe("useRaidChartMyScore with a record", () => {
  it("starts from the saved score and saves a second after typing stops", async () => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    const { result } = renderMyScore({ context: context() });

    expect(result.current.mode).toBe("record");
    expect(result.current.value).toBe("40,000,000");
    act(() => result.current.onChange("41000000"));
    await advance(999);
    expect(fetchCalls).toEqual([]);
    await advance(1);

    expect(fetchCalls).toEqual([
      {
        url: "/api/raid-records/chart-score",
        body: { server: "kr", raidType: "elimination", seasonIndex: 35, defenseType: "heavy", score: 41_000_000 },
      },
    ]);
    expect(result.current.savedScore).toBe(41_000_000);
    expect(result.current.toastVisible).toBe(true);
    await advance(2500);
    expect(result.current.toastVisible).toBe(false);
    // The record mode never touches the browser copy.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("does not save a score equal to the saved one", async () => {
    const { result } = renderMyScore({ context: context() });
    act(() => result.current.onChange("40,000,000"));
    await advance(2000);
    expect(fetchCalls).toEqual([]);
  });

  it("clears the score only of a score-only record", async () => {
    const { result, rerender } = renderMyScore({ context: context() });
    act(() => result.current.onChange(""));
    await advance(2000);
    expect(fetchCalls).toEqual([]);

    respond = async () => jsonResponse(200, { ok: true, record: null });
    rerender({ context: context({ kr: { ...context().kr, record: chartRecord({ rank: null, rankStatus: "missing", scoreOnly: true }) } }), defenseType: "heavy" });
    act(() => result.current.onChange(""));
    await advance(1000);

    expect(fetchCalls.map((call) => call.body.score)).toEqual([null]);
    expect(result.current.record).toBeNull();
    // Removing a score is not "saved to my record".
    expect(result.current.toastVisible).toBe(false);
  });

  it("sends a pending save at once when the defense type changes", async () => {
    const { result, rerender } = renderMyScore({ context: context() });
    act(() => result.current.onChange("41000000"));
    rerender({ context: context(), defenseType: "elastic" });
    await advance(0);

    expect(fetchCalls.map((call) => [call.body.defenseType, call.body.score])).toEqual([["heavy", 41_000_000]]);
    expect(result.current.value).toBe("");
  });

  it("sends one save at a time, so an older score cannot land after a newer one", async () => {
    let release: () => void = () => {};
    const firstResponse = new Promise<void>((resolve) => {
      release = resolve;
    });
    const defaultRespond = respond;
    respond = async (call) => {
      if (fetchCalls.length === 1) await firstResponse;
      return defaultRespond(call);
    };
    const { result } = renderMyScore({ context: context() });

    act(() => result.current.onChange("41000000"));
    await advance(1000);
    act(() => result.current.onChange("42000000"));
    await advance(1000);
    expect(fetchCalls).toHaveLength(1);

    await act(async () => {
      release();
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(fetchCalls.map((call) => call.body.score)).toEqual([41_000_000, 42_000_000]);
    expect(result.current.savedScore).toBe(42_000_000);
  });

  function holdFirstResponse() {
    let release: () => void = () => {};
    const firstResponse = new Promise<void>((resolve) => {
      release = resolve;
    });
    const defaultRespond = respond;
    respond = async (call) => {
      if (fetchCalls.length === 1) await firstResponse;
      return defaultRespond(call);
    };
    return async () => {
      await act(async () => {
        release();
        await jest.advanceTimersByTimeAsync(0);
      });
    };
  }

  it("saves the score typed back to the saved one while a newer score is on its way", async () => {
    const release = holdFirstResponse();
    const { result } = renderMyScore({ context: context() });

    act(() => result.current.onChange("41000000"));
    await advance(1000);
    act(() => result.current.onChange("40000000"));
    await advance(1000);
    await release();

    expect(fetchCalls.map((call) => call.body.score)).toEqual([41_000_000, 40_000_000]);
    expect(result.current.savedScore).toBe(40_000_000);
    expect(result.current.value).toBe("40,000,000");
  });

  it("removes the first score when the input is emptied while that score is on its way", async () => {
    const release = holdFirstResponse();
    const { result } = renderMyScore({ context: context({ kr: { ...context().kr, record: null } }) });

    act(() => result.current.onChange("41000000"));
    await advance(1000);
    act(() => result.current.onChange(""));
    await advance(1000);
    respond = async () => jsonResponse(200, { ok: true, record: null });
    await release();

    expect(fetchCalls.map((call) => call.body.score)).toEqual([41_000_000, null]);
    expect(result.current.record).toBeNull();
  });

  it("keeps the newest waiting score of every defense type while one save is on its way", async () => {
    const release = holdFirstResponse();
    const { result, rerender } = renderMyScore({ context: context() });

    act(() => result.current.onChange("41000000"));
    rerender({ context: context(), defenseType: "elastic" });
    await advance(0);
    act(() => result.current.onChange("30000000"));
    rerender({ context: context(), defenseType: "light" });
    await advance(0);
    act(() => result.current.onChange("20000000"));
    rerender({ context: context(), defenseType: "heavy" });
    await advance(0);
    // Back on the defense type being saved, the input shows the score on its way.
    expect(result.current.value).toBe("41,000,000");
    await release();

    expect(fetchCalls.map((call) => [call.body.defenseType, call.body.score])).toEqual([
      ["heavy", 41_000_000],
      ["elastic", 30_000_000],
      ["light", 20_000_000],
    ]);
  });

  it("keeps a failed save's status, retry, and toast with its own server", async () => {
    const jpRecord = chartRecord({ uid: "jp-record", scores: [{ defenseType: "heavy", score: 38_000_000 }], rank: null });
    const ctx = context({
      jp: { server: "jp", seasonIndex: 33, started: true, scoreDefenseTypes: ["heavy", "elastic", "light"], record: jpRecord },
    });
    let release: () => void = () => {};
    const firstResponse = new Promise<void>((resolve) => {
      release = resolve;
    });
    respond = async ({ body }) => {
      if (body.server === "kr") {
        await firstResponse;
        return jsonResponse(500, { ok: false, message: "저장하지 못했어요." });
      }
      return jsonResponse(200, { ok: true, record: { ...jpRecord, scores: [{ defenseType: "heavy", score: body.score as number }] } });
    };
    const { result } = renderMyScore({ context: ctx });

    act(() => result.current.onChange("41000000"));
    await advance(1000);
    act(() => result.current.selectServer("jp"));
    act(() => result.current.onChange("37000000"));
    await advance(1000);
    act(() => result.current.selectServer("kr"));
    await act(async () => {
      release();
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(fetchCalls.map((call) => [call.body.server, call.body.score])).toEqual([
      ["kr", 41_000_000],
      ["jp", 37_000_000],
    ]);
    // The Korean score failed: the Japanese success neither clears that nor shows its toast here.
    expect(result.current.value).toBe("41,000,000");
    expect(result.current.status).toEqual({ kind: "failed", message: "저장하지 못했어요.", retryable: true });
    expect(result.current.toastVisible).toBe(false);

    respond = async ({ body }) =>
      jsonResponse(200, { ok: true, record: chartRecord({ scores: [{ defenseType: "heavy", score: body.score as number }] }) });
    await act(async () => {
      result.current.retry();
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(fetchCalls.at(-1)?.body).toMatchObject({ server: "kr", score: 41_000_000 });
    expect(result.current.status).toEqual({ kind: "idle" });
    expect(result.current.toastVisible).toBe(true);

    act(() => result.current.selectServer("jp"));
    expect(result.current.status).toEqual({ kind: "idle" });
    expect(result.current.value).toBe("37,000,000");
  });

  it("shows the server's message for a rejected score and offers a retry for a failed save", async () => {
    respond = async () => jsonResponse(400, { ok: false, message: "최대 점수(40,348,000)보다 높아요." });
    const { result } = renderMyScore({ context: context() });
    act(() => result.current.onChange("50000000"));
    await advance(1000);
    expect(result.current.status).toEqual({
      kind: "failed",
      message: "최대 점수(40,348,000)보다 높아요.",
      retryable: false,
    });

    respond = async () => jsonResponse(500, { ok: false, message: "저장하지 못했어요." });
    act(() => result.current.onChange("39000000"));
    await advance(1000);
    expect(result.current.status).toEqual({ kind: "failed", message: "저장하지 못했어요.", retryable: true });

    respond = async ({ body }) =>
      jsonResponse(200, { ok: true, record: chartRecord({ scores: [{ defenseType: "heavy", score: body.score as number }] }) });
    await act(async () => {
      result.current.retry();
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(fetchCalls.at(-1)?.body.score).toBe(39_000_000);
    expect(result.current.status).toEqual({ kind: "idle" });
  });

  it("switches to the Japanese record of the matching season", async () => {
    const jpRecord = chartRecord({ uid: "jp-record", scores: [{ defenseType: "heavy", score: 38_000_000 }], rank: null });
    const { result } = renderMyScore({
      context: context({
        jp: { server: "jp", seasonIndex: 33, started: true, scoreDefenseTypes: ["heavy", "elastic", "light"], record: jpRecord },
      }),
    });

    expect(result.current.serverOptions).toEqual({ kr: 35, jp: 33 });
    act(() => result.current.selectServer("jp"));
    expect(result.current.value).toBe("38,000,000");
    expect(result.current.record?.uid).toBe("jp-record");

    act(() => result.current.onChange("37000000"));
    await advance(1000);
    expect(fetchCalls.map((call) => [call.body.server, call.body.seasonIndex])).toEqual([["jp", 33]]);
  });
});
