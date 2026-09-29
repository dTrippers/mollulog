import {
  analyzeTreasureHuntBoard,
  InvalidTreasureHuntCompositionError,
  InvalidTreasureHuntObservationError,
} from "../../../../domain/treasure-hunt";
import type {
  TreasureHuntBoardWorkerRequest,
  TreasureHuntBoardWorkerResponse,
} from "./treasure-hunt-board-worker.shared";

type RuntimeOptions = {
  postMessage: (message: TreasureHuntBoardWorkerResponse) => void;
};

/** Worker-side message handler, exported so its protocol can be tested without a browser. */
export class TreasureHuntBoardWorkerRuntime {
  private readonly postMessage: RuntimeOptions["postMessage"];

  constructor(options: RuntimeOptions) {
    this.postMessage = options.postMessage;
  }

  analyze(request: TreasureHuntBoardWorkerRequest): void {
    try {
      const result = analyzeTreasureHuntBoard(request.composition, request.observation);
      this.postMessage({ type: "result", requestId: request.requestId, ...result });
    } catch (error) {
      const reason =
        error instanceof InvalidTreasureHuntCompositionError || error instanceof InvalidTreasureHuntObservationError
          ? "invalid-input"
          : "analysis-failure";
      this.postMessage({ type: "error", requestId: request.requestId, reason });
    }
  }
}

const workerScope =
  typeof self === "undefined"
    ? undefined
    : (self as unknown as {
        onmessage: ((event: MessageEvent<TreasureHuntBoardWorkerRequest>) => void) | null;
        postMessage: (message: TreasureHuntBoardWorkerResponse) => void;
      });

if (workerScope) {
  const runtime = new TreasureHuntBoardWorkerRuntime({ postMessage: (message) => workerScope.postMessage(message) });
  workerScope.onmessage = (event) => runtime.analyze(event.data);
}
