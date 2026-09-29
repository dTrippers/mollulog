import { describe, expect, it } from "@jest/globals";
import { TreasureHuntStatsWorkerRuntime } from "~/components/features/events/shop/treasure-hunt-stats.worker";
import type { TreasureHuntStatsWorkerResponse } from "~/components/features/events/shop/treasure-hunt-stats-worker.shared";
import {
  TREASURE_HUNT_TARGET_GAMES,
  type TreasureHuntComposition,
  type TreasureHuntSimulator,
  treasureHuntCompositionSignature,
} from "~/domain/treasure-hunt";

function composition(boardWidth: number): TreasureHuntComposition {
  return {
    boardWidth,
    boardHeight: 1,
    pieces: [{ width: 1, height: 1, count: 1 }],
  };
}

function scheduleItem(boardWidth: number) {
  const value = composition(boardWidth);
  return { signature: treasureHuntCompositionSignature(value), composition: value };
}

function fakeSimulator(value: number): TreasureHuntSimulator {
  return {
    minCells: 1,
    boardCells: value,
    simulateGame: (gameIndex) => (gameIndex % value) + 1,
  };
}

describe("treasure hunt stats worker scheduling", () => {
  it("retains the active result and reprioritizes pending work without recalculation", async () => {
    const messages: { message: TreasureHuntStatsWorkerResponse; at: number }[] = [];
    const factoryCalls = new Map<string, number>();
    let clock = 0;
    let resolveFirstYield: (() => void) | undefined;
    let signalFirstYield: (() => void) | undefined;
    const firstYield = new Promise<void>((resolve) => {
      signalFirstYield = resolve;
    });
    let yieldCount = 0;
    const first = scheduleItem(2);
    const second = scheduleItem(3);
    const third = scheduleItem(4);
    const runtime = new TreasureHuntStatsWorkerRuntime({
      batchSize: 100,
      now: () => clock,
      postMessage: (message) => messages.push({ message, at: clock }),
      createSimulator: (item) => {
        const signature = treasureHuntCompositionSignature(item);
        factoryCalls.set(signature, (factoryCalls.get(signature) ?? 0) + 1);
        return fakeSimulator(item.boardWidth);
      },
      yieldToEventLoop: () => {
        yieldCount++;
        if (yieldCount === 1) {
          return new Promise<void>((resolve) => {
            resolveFirstYield = () => {
              clock += 300;
              resolve();
            };
            signalFirstYield?.();
          });
        }
        clock += 300;
        return Promise.resolve();
      },
    });

    runtime.schedule({ type: "schedule", items: [first, second, third] });
    await firstYield;
    runtime.schedule({ type: "schedule", items: [third, second, first] });
    resolveFirstYield?.();
    await runtime.waitUntilIdle();

    const doneMessages = messages.filter(
      (entry): entry is { message: Extract<TreasureHuntStatsWorkerResponse, { type: "done" }>; at: number } =>
        entry.message.type === "done",
    );
    expect(doneMessages.map(({ message }) => message.signature)).toEqual([
      first.signature,
      third.signature,
      second.signature,
    ]);
    expect([...factoryCalls.values()]).toEqual([1, 1, 1]);

    for (const item of [first, second, third]) {
      const progress = messages
        .filter((entry) => entry.message.type === "progress" && entry.message.signature === item.signature)
        .map(({ at }) => at);
      expect(progress.every((time, index) => index === 0 || time - (progress[index - 1] ?? 0) >= 250)).toBe(true);
      const done = doneMessages.find(({ message }) => message.signature === item.signature)?.message;
      expect(done?.targetGames).toBe(TREASURE_HUNT_TARGET_GAMES);
      expect(done?.histogram.counts.reduce((sum, count) => sum + count, 0)).toBe(TREASURE_HUNT_TARGET_GAMES);
    }

    const previousFactoryCalls = new Map(factoryCalls);
    runtime.schedule({ type: "schedule", items: [first, second, third] });
    await runtime.waitUntilIdle();
    expect(factoryCalls).toEqual(previousFactoryCalls);
    expect(messages.filter(({ message }) => message.type === "done")).toHaveLength(6);
  });

  it("reports invalid compositions and engine failures without exposing raw errors", async () => {
    const messages: TreasureHuntStatsWorkerResponse[] = [];
    const valid = scheduleItem(2);
    const invalid = { ...valid, signature: "not-the-composition-signature" };
    const runtime = new TreasureHuntStatsWorkerRuntime({
      postMessage: (message) => messages.push(message),
      createSimulator: () => {
        throw new Error("private engine details");
      },
      yieldToEventLoop: () => Promise.resolve(),
    });

    runtime.schedule({ type: "schedule", items: [invalid, valid] });
    await runtime.waitUntilIdle();

    expect(messages).toEqual([
      { type: "error", signature: invalid.signature, reason: "invalid-composition" },
      { type: "error", signature: valid.signature, reason: "engine-failure" },
    ]);
  });

  it("retries a failed signature when it is scheduled again", async () => {
    const messages: TreasureHuntStatsWorkerResponse[] = [];
    const item = scheduleItem(2);
    let factoryCalls = 0;
    const runtime = new TreasureHuntStatsWorkerRuntime({
      postMessage: (message) => messages.push(message),
      createSimulator: () => {
        factoryCalls++;
        if (factoryCalls === 1) {
          throw new Error("transient engine failure");
        }
        return fakeSimulator(2);
      },
      yieldToEventLoop: () => Promise.resolve(),
    });

    runtime.schedule({ type: "schedule", items: [item] });
    await runtime.waitUntilIdle();
    runtime.schedule({ type: "schedule", items: [item] });
    await runtime.waitUntilIdle();

    expect(factoryCalls).toBe(2);
    expect(messages.filter((message) => message.type === "error")).toEqual([
      { type: "error", signature: item.signature, reason: "engine-failure" },
    ]);
    expect(messages.filter((message) => message.type === "done")).toHaveLength(1);
  });
});
