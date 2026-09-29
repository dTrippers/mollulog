import { describe, expect, it } from "@jest/globals";
import { TreasureHuntBoardWorkerRuntime } from "~/components/features/events/treasure-hunt/treasure-hunt-board.worker";
import type { TreasureHuntBoardWorkerResponse } from "~/components/features/events/treasure-hunt/treasure-hunt-board-worker.shared";
import type { TreasureHuntComposition } from "~/domain/treasure-hunt";

const composition: TreasureHuntComposition = {
  boardWidth: 3,
  boardHeight: 2,
  pieces: [{ width: 1, height: 1, count: 1 }],
};

describe("treasure hunt board worker messages", () => {
  it("returns an analysis result with the matching request id", () => {
    const messages: TreasureHuntBoardWorkerResponse[] = [];
    const runtime = new TreasureHuntBoardWorkerRuntime({ postMessage: (message) => messages.push(message) });

    runtime.analyze({
      type: "analyze",
      requestId: 17,
      composition,
      observation: { knownEmpty: [], foundTreasures: [] },
    });

    expect(messages).toEqual([
      expect.objectContaining({
        type: "result",
        requestId: 17,
        status: "ok",
        recommended: expect.any(Array),
        remaining: [{ width: 1, height: 1, count: 1 }],
      }),
    ]);
  });

  it("replies to every request and reports only sanitized invalid-input errors", () => {
    const messages: TreasureHuntBoardWorkerResponse[] = [];
    const runtime = new TreasureHuntBoardWorkerRuntime({ postMessage: (message) => messages.push(message) });

    runtime.analyze({
      type: "analyze",
      requestId: 1,
      composition,
      observation: { knownEmpty: [], foundTreasures: [] },
    });
    runtime.analyze({
      type: "analyze",
      requestId: 2,
      composition,
      observation: { knownEmpty: [{ x: 3, y: 0 }], foundTreasures: [] },
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual(expect.objectContaining({ type: "result", requestId: 1 }));
    expect(messages[1]).toEqual({ type: "error", requestId: 2, reason: "invalid-input" });
    expect(JSON.stringify(messages)).not.toContain("integer coordinate on the board");
  });

  it("sanitizes engine failures while still replying with the request id", () => {
    const messages: TreasureHuntBoardWorkerResponse[] = [];
    const runtime = new TreasureHuntBoardWorkerRuntime({ postMessage: (message) => messages.push(message) });

    runtime.analyze({
      type: "analyze",
      requestId: 99,
      composition: { boardWidth: 31, boardHeight: 1, pieces: [{ width: 31, height: 1, count: 1 }] },
      observation: { knownEmpty: [], foundTreasures: [] },
    });

    expect(messages).toEqual([{ type: "error", requestId: 99, reason: "analysis-failure" }]);
  });
});
