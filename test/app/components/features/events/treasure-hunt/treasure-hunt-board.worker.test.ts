import { describe, expect, it } from "@jest/globals";
import { TreasureHuntBoardWorkerRuntime } from "~/components/features/events/treasure-hunt/treasure-hunt-board.worker";
import type {
  TreasureHuntBoardWorkerRequest,
  TreasureHuntBoardWorkerResponse,
} from "~/components/features/events/treasure-hunt/treasure-hunt-board-worker.shared";
import {
  analyzeTreasureHuntBoard,
  type TreasureHuntBoardAnalysis,
  type TreasureHuntBoardObservation,
  type TreasureHuntComposition,
} from "~/domain/treasure-hunt";

function composition(
  boardWidth = 3,
  boardHeight = 3,
  pieces: TreasureHuntComposition["pieces"] = [{ width: 1, height: 1, count: 1 }],
): TreasureHuntComposition {
  return { boardWidth, boardHeight, pieces };
}

function request(
  requestId: number,
  value: {
    composition?: TreasureHuntComposition;
    observation?: TreasureHuntBoardObservation;
  } = {},
): TreasureHuntBoardWorkerRequest {
  return {
    type: "analyze",
    requestId,
    composition: value.composition ?? composition(),
    observation: value.observation ?? { knownEmpty: [], foundTreasures: [] },
  };
}

function resultOf(
  message: TreasureHuntBoardWorkerResponse,
): Extract<TreasureHuntBoardWorkerResponse, { type: "result" }> {
  if (message.type !== "result") throw new Error("Expected a successful board analysis.");
  return message;
}

function errorOf(
  message: TreasureHuntBoardWorkerResponse,
): Extract<TreasureHuntBoardWorkerResponse, { type: "error" }> {
  if (message.type !== "error") throw new Error("Expected a failed board analysis.");
  return message;
}

describe("treasure hunt board worker result cache", () => {
  it("reuses an identical successful analysis and preserves each request ID", () => {
    const messages: TreasureHuntBoardWorkerResponse[] = [];
    let analysisCalls = 0;
    const runtime = new TreasureHuntBoardWorkerRuntime({
      postMessage: (message) => messages.push(message),
      analyzeBoard: (board, observation) => {
        analysisCalls++;
        return analyzeTreasureHuntBoard(board, observation);
      },
    });

    const failed = request(1);
    runtime.analyze(failed);
    const original = JSON.parse(JSON.stringify(resultOf(messages[0] as TreasureHuntBoardWorkerResponse))) as ReturnType<
      typeof resultOf
    >;
    const firstResult = resultOf(messages[0] as TreasureHuntBoardWorkerResponse);
    const firstCell = firstResult.cells?.[0]?.[0];
    if (firstResult.cells?.[0]) firstResult.cells[0][0] = 0;

    runtime.analyze(request(2));

    expect(analysisCalls).toBe(1);
    expect(messages.map((message) => message.requestId)).toEqual([1, 2]);
    expect(resultOf(messages[1] as TreasureHuntBoardWorkerResponse).cells?.[0]?.[0]).toBe(firstCell);
    expect(resultOf(messages[1] as TreasureHuntBoardWorkerResponse)).toEqual({
      ...original,
      requestId: 2,
    });
  });

  it("misses when dimensions, empty cells, found positions, or found orientation change", () => {
    const messages: TreasureHuntBoardWorkerResponse[] = [];
    let analysisCalls = 0;
    const runtime = new TreasureHuntBoardWorkerRuntime({
      postMessage: (message) => messages.push(message),
      analyzeBoard: (board, observation) => {
        analysisCalls++;
        return analyzeTreasureHuntBoard(board, observation);
      },
    });

    const rectangular = composition(3, 2);
    runtime.analyze(request(1, { composition: rectangular }));
    runtime.analyze(request(2, { composition: composition(2, 3) }));
    runtime.analyze(
      request(3, {
        composition: rectangular,
        observation: { knownEmpty: [{ x: 0, y: 0 }], foundTreasures: [] },
      }),
    );

    const bar = composition(3, 3, [{ width: 1, height: 2, count: 1 }]);
    runtime.analyze(
      request(4, {
        composition: bar,
        observation: {
          knownEmpty: [],
          foundTreasures: [{ x: 0, y: 0, width: 1, height: 2, orientation: "horizontal" }],
        },
      }),
    );
    runtime.analyze(
      request(5, {
        composition: bar,
        observation: {
          knownEmpty: [],
          foundTreasures: [{ x: 1, y: 0, width: 1, height: 2, orientation: "horizontal" }],
        },
      }),
    );
    runtime.analyze(
      request(6, {
        composition: bar,
        observation: { knownEmpty: [], foundTreasures: [{ x: 0, y: 0, width: 1, height: 2, orientation: "vertical" }] },
      }),
    );

    expect(analysisCalls).toBe(6);
    expect(resultOf(messages[0] as TreasureHuntBoardWorkerResponse).cells).toHaveLength(2);
    expect(resultOf(messages[0] as TreasureHuntBoardWorkerResponse).cells?.[0]).toHaveLength(3);
    expect(resultOf(messages[1] as TreasureHuntBoardWorkerResponse).cells).toHaveLength(3);
    expect(resultOf(messages[1] as TreasureHuntBoardWorkerResponse).cells?.[0]).toHaveLength(2);
  });

  it("keeps invalid observations and analysis failures out of the cache", () => {
    const messages: TreasureHuntBoardWorkerResponse[] = [];
    let analysisCalls = 0;
    let failNext = true;
    const runtime = new TreasureHuntBoardWorkerRuntime({
      postMessage: (message) => messages.push(message),
      analyzeBoard: (board, observation) => {
        analysisCalls++;
        if (failNext) {
          failNext = false;
          throw new Error("private solver detail");
        }
        return analyzeTreasureHuntBoard(board, observation);
      },
    });

    runtime.analyze(request(1));
    expect(errorOf(messages[0] as TreasureHuntBoardWorkerResponse)).toEqual({
      type: "error",
      requestId: 1,
      reason: "analysis-failure",
    });
    const knownEmpty: TreasureHuntBoardObservation["knownEmpty"][number][] = [];
    const cached = request(2, { observation: { knownEmpty, foundTreasures: [] } });
    runtime.analyze(cached);
    expect(resultOf(messages[1] as TreasureHuntBoardWorkerResponse).status).toBe("ok");
    runtime.analyze(request(3));
    expect(analysisCalls).toBe(2);

    knownEmpty.push({ x: -1, y: 0 });
    runtime.analyze({ ...cached, requestId: 4 });
    runtime.analyze({ ...cached, requestId: 5 });

    expect(analysisCalls).toBe(4);
    expect(messages.slice(3).map(errorOf)).toEqual([
      { type: "error", requestId: 4, reason: "invalid-input" },
      { type: "error", requestId: 5, reason: "invalid-input" },
    ]);
  });

  it("does not cache inconsistent board analyses", () => {
    const messages: TreasureHuntBoardWorkerResponse[] = [];
    let analysisCalls = 0;
    const runtime = new TreasureHuntBoardWorkerRuntime({
      postMessage: (message) => messages.push(message),
      analyzeBoard: () => {
        analysisCalls++;
        return { status: "inconsistent", cells: null, recommended: [], remaining: [] };
      },
    });

    runtime.analyze(request(1));
    runtime.analyze(request(2));

    expect(analysisCalls).toBe(2);
    expect(resultOf(messages[0] as TreasureHuntBoardWorkerResponse).status).toBe("inconsistent");
    expect(resultOf(messages[1] as TreasureHuntBoardWorkerResponse).status).toBe("inconsistent");
  });

  it("evicts the least-recently-used result after 128 entries", () => {
    const messages: TreasureHuntBoardWorkerResponse[] = [];
    let analysisCalls = 0;
    const analysis: TreasureHuntBoardAnalysis = {
      status: "ok",
      cells: [[1]],
      recommended: [{ x: 0, y: 0 }],
      remaining: [{ width: 1, height: 1, count: 1 }],
    };
    const runtime = new TreasureHuntBoardWorkerRuntime({
      postMessage: (message) => messages.push(message),
      analyzeBoard: () => {
        analysisCalls++;
        return analysis;
      },
    });
    const requests = Array.from({ length: 129 }, (_, index) =>
      request(index, { composition: composition(index + 2, 1) }),
    );

    for (const item of requests.slice(0, 128)) runtime.analyze(item);
    expect(analysisCalls).toBe(128);

    runtime.analyze(requests[0] as TreasureHuntBoardWorkerRequest);
    expect(analysisCalls).toBe(128);
    runtime.analyze(requests[128] as TreasureHuntBoardWorkerRequest);
    expect(analysisCalls).toBe(129);
    runtime.analyze(requests[0] as TreasureHuntBoardWorkerRequest);
    expect(analysisCalls).toBe(129);
    runtime.analyze(requests[1] as TreasureHuntBoardWorkerRequest);
    expect(analysisCalls).toBe(130);
    expect(messages).toHaveLength(132);
  });
});
