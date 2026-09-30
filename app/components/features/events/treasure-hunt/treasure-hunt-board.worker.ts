import {
  analyzeTreasureHuntBoard,
  InvalidTreasureHuntCompositionError,
  InvalidTreasureHuntObservationError,
  type TreasureHuntBoardAnalysis,
} from "../../../../domain/treasure-hunt";
import type {
  TreasureHuntBoardWorkerRequest,
  TreasureHuntBoardWorkerResponse,
} from "./treasure-hunt-board-worker.shared";

type RuntimeOptions = {
  postMessage: (message: TreasureHuntBoardWorkerResponse) => void;
  analyzeBoard?: typeof analyzeTreasureHuntBoard;
};

const MAX_CACHED_BOARD_ANALYSES = 128;

/** Worker-side message handler, exported so its protocol can be tested without a browser. */
export class TreasureHuntBoardWorkerRuntime {
  private readonly postMessage: RuntimeOptions["postMessage"];
  private readonly analyzeBoard: NonNullable<RuntimeOptions["analyzeBoard"]>;
  private readonly completed = new Map<string, TreasureHuntBoardAnalysis>();

  constructor(options: RuntimeOptions) {
    this.postMessage = options.postMessage;
    this.analyzeBoard = options.analyzeBoard ?? analyzeTreasureHuntBoard;
  }

  analyze(request: TreasureHuntBoardWorkerRequest): void {
    try {
      const key = boardAnalysisCacheKey(request);
      if (key) {
        const cached = this.readCachedAnalysis(key);
        if (cached) {
          this.postMessage({ type: "result", requestId: request.requestId, ...cloneBoardAnalysis(cached) });
          return;
        }
      }

      const result = this.analyzeBoard(request.composition, request.observation);
      if (key && result.status === "ok") {
        this.rememberAnalysis(key, result);
      }
      this.postMessage({ type: "result", requestId: request.requestId, ...cloneBoardAnalysis(result) });
    } catch (error) {
      const reason =
        error instanceof InvalidTreasureHuntCompositionError || error instanceof InvalidTreasureHuntObservationError
          ? "invalid-input"
          : "analysis-failure";
      this.postMessage({ type: "error", requestId: request.requestId, reason });
    }
  }

  private readCachedAnalysis(key: string): TreasureHuntBoardAnalysis | undefined {
    const cached = this.completed.get(key);
    if (!cached) return undefined;
    this.completed.delete(key);
    this.completed.set(key, cached);
    return cached;
  }

  private rememberAnalysis(key: string, analysis: TreasureHuntBoardAnalysis): void {
    this.completed.delete(key);
    this.completed.set(key, cloneBoardAnalysis(analysis));
    while (this.completed.size > MAX_CACHED_BOARD_ANALYSES) {
      const oldest = this.completed.keys().next().value;
      if (oldest === undefined) return;
      this.completed.delete(oldest);
    }
  }
}

/**
 * Keep the original dimensions and every solver input field in the key.
 * In particular, rotated boards and found-piece orientations can have
 * different row-major output even when their placement signatures match.
 * Structurally malformed observations bypass the cache so the analyzer keeps
 * owning invalid-input reporting.
 */
function boardAnalysisCacheKey(request: TreasureHuntBoardWorkerRequest): string | null {
  const { composition, observation } = request;
  if (
    !composition ||
    !Array.isArray(composition.pieces) ||
    !observation ||
    !Array.isArray(observation.knownEmpty) ||
    !Array.isArray(observation.foundTreasures)
  ) {
    return null;
  }

  const pieceKey = composition.pieces.map((piece) =>
    piece && typeof piece === "object" ? [piece.width, piece.height, piece.count] : null,
  );
  const emptyKey = observation.knownEmpty.map((cell) => (cell && typeof cell === "object" ? [cell.x, cell.y] : null));
  const foundKey = observation.foundTreasures.map((treasure) =>
    treasure && typeof treasure === "object"
      ? [treasure.x, treasure.y, treasure.width, treasure.height, treasure.orientation]
      : null,
  );

  try {
    return JSON.stringify({
      boardWidth: composition.boardWidth,
      boardHeight: composition.boardHeight,
      pieces: pieceKey,
      knownEmpty: emptyKey,
      foundTreasures: foundKey,
    });
  } catch {
    return null;
  }
}

function cloneBoardAnalysis(analysis: TreasureHuntBoardAnalysis): TreasureHuntBoardAnalysis {
  return {
    status: analysis.status,
    cells: analysis.cells?.map((row) => [...row]) ?? null,
    recommended: analysis.recommended.map(({ x, y }) => ({ x, y })),
    remaining: analysis.remaining.map(({ width, height, count }) => ({ width, height, count })),
  };
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
