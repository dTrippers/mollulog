import {
  createTreasureHuntSimulator,
  InvalidTreasureHuntCompositionError,
  isValidTreasureHuntComposition,
  TREASURE_HUNT_TARGET_GAMES,
  treasureHuntCompositionSignature,
  type OpenedCellHistogram,
  type TreasureHuntComposition,
  type TreasureHuntSimulator,
} from "~/domain/treasure-hunt";
import type {
  TreasureHuntStatsScheduleItem,
  TreasureHuntStatsWorkerRequest,
  TreasureHuntStatsWorkerResponse,
} from "./treasure-hunt-stats-worker.shared";

const DEFAULT_BATCH_SIZE = 8;
const MIN_PROGRESS_INTERVAL_MS = 250;

type SimulatorFactory = (composition: TreasureHuntComposition) => TreasureHuntSimulator;

type RuntimeOptions = {
  postMessage: (message: TreasureHuntStatsWorkerResponse) => void;
  createSimulator?: SimulatorFactory;
  batchSize?: number;
  now?: () => number;
  yieldToEventLoop?: () => Promise<void>;
};

type ActiveWork = {
  item: TreasureHuntStatsScheduleItem;
  simulator: TreasureHuntSimulator;
  completedGames: number;
  counts: number[];
  lastProgressAt: number | null;
};

/** Worker-side priority queue. It is exported so its message contract can be tested without a browser. */
export class TreasureHuntStatsWorkerRuntime {
  private readonly postMessage: RuntimeOptions["postMessage"];
  private readonly createSimulator: SimulatorFactory;
  private readonly batchSize: number;
  private readonly now: () => number;
  private readonly yieldToEventLoop: () => Promise<void>;
  private readonly completed = new Map<string, OpenedCellHistogram>();
  private pending: TreasureHuntStatsScheduleItem[] = [];
  private active: ActiveWork | null = null;
  private processing: Promise<void> | null = null;

  constructor(options: RuntimeOptions) {
    this.postMessage = options.postMessage;
    this.createSimulator = options.createSimulator ?? createTreasureHuntSimulator;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.now = options.now ?? (() => globalThis.performance?.now() ?? Date.now());
    this.yieldToEventLoop = options.yieldToEventLoop ?? (() => new Promise((resolve) => setTimeout(resolve, 0)));
    if (!Number.isSafeInteger(this.batchSize) || this.batchSize <= 0) {
      throw new RangeError("Worker batch size must be a positive integer.");
    }
  }

  schedule(request: TreasureHuntStatsWorkerRequest): void {
    if (request.type !== "schedule") {
      return;
    }

    const seen = new Set<string>();
    const nextPending: TreasureHuntStatsScheduleItem[] = [];
    for (const item of request.items) {
      if (!item || typeof item.signature !== "string" || seen.has(item.signature)) {
        continue;
      }
      seen.add(item.signature);

      let canonicalSignature: string;
      try {
        canonicalSignature = treasureHuntCompositionSignature(item.composition);
      } catch {
        this.postError(item.signature, "invalid-composition");
        continue;
      }
      if (canonicalSignature !== item.signature || !isValidTreasureHuntComposition(item.composition)) {
        this.postError(item.signature, "invalid-composition");
        continue;
      }

      const completedHistogram = this.completed.get(item.signature);
      if (completedHistogram) {
        this.postMessage({
          type: "done",
          signature: item.signature,
          histogram: cloneHistogram(completedHistogram),
          targetGames: TREASURE_HUNT_TARGET_GAMES,
        });
        continue;
      }
      if (this.active?.item.signature === item.signature) {
        continue;
      }
      nextPending.push(item);
    }

    // The active composition keeps its accumulated games; only unstarted work is reprioritized.
    this.pending = nextPending;
    this.startProcessing();
  }

  async waitUntilIdle(): Promise<void> {
    while (this.processing) {
      await this.processing;
    }
  }

  private startProcessing(): void {
    if (this.processing) {
      return;
    }
    this.processing = this.processQueue().catch(() => undefined).then(() => {
      this.processing = null;
      if (this.active || this.pending.length > 0) {
        this.startProcessing();
      }
    });
  }

  private async processQueue(): Promise<void> {
    while (this.active || this.pending.length > 0) {
      if (!this.active) {
        const item = this.pending.shift();
        if (!item) {
          return;
        }
        try {
          const simulator = this.createSimulator(item.composition);
          this.active = {
            item,
            simulator,
            completedGames: 0,
            counts: Array(simulator.boardCells - simulator.minCells + 1).fill(0),
            lastProgressAt: null,
          };
        } catch (error) {
          this.postError(
            item.signature,
            error instanceof InvalidTreasureHuntCompositionError ? "invalid-composition" : "engine-failure",
          );
          continue;
        }
      }

      const work = this.active;
      if (!work) {
        continue;
      }
      try {
        const batchEnd = Math.min(work.completedGames + this.batchSize, TREASURE_HUNT_TARGET_GAMES);
        while (work.completedGames < batchEnd) {
          const openedCells = work.simulator.simulateGame(work.completedGames);
          const histogramIndex = openedCells - work.simulator.minCells;
          const currentCount = work.counts[histogramIndex];
          if (
            !Number.isSafeInteger(openedCells) ||
            openedCells < work.simulator.minCells ||
            openedCells > work.simulator.boardCells ||
            histogramIndex < 0 ||
            currentCount === undefined
          ) {
            throw new Error("Simulation returned an invalid opened-cell count.");
          }
          work.counts[histogramIndex] = currentCount + 1;
          work.completedGames++;
        }

        const now = this.now();
        if (work.lastProgressAt === null || now - work.lastProgressAt >= MIN_PROGRESS_INTERVAL_MS) {
          this.postMessage({
            type: "progress",
            signature: work.item.signature,
            completedGames: work.completedGames,
            targetGames: TREASURE_HUNT_TARGET_GAMES,
            histogram: this.histogramFor(work),
          });
          work.lastProgressAt = now;
        }

        // A task-queue yield lets incoming schedule messages reorder the pending compositions.
        await this.yieldToEventLoop();
        if (work.completedGames === TREASURE_HUNT_TARGET_GAMES) {
          const histogram = this.histogramFor(work);
          this.completed.set(work.item.signature, cloneHistogram(histogram));
          this.postMessage({
            type: "done",
            signature: work.item.signature,
            histogram,
            targetGames: TREASURE_HUNT_TARGET_GAMES,
          });
          this.active = null;
        }
      } catch {
        this.postError(work.item.signature, "engine-failure");
        this.active = null;
      }
    }
  }

  private histogramFor(work: ActiveWork): OpenedCellHistogram {
    return { minCells: work.simulator.minCells, counts: [...work.counts] };
  }

  private postError(signature: string, reason: "invalid-composition" | "engine-failure"): void {
    this.postMessage({ type: "error", signature, reason });
  }
}

function cloneHistogram(histogram: OpenedCellHistogram): OpenedCellHistogram {
  return { minCells: histogram.minCells, counts: [...histogram.counts] };
}

const workerScope =
  typeof self === "undefined"
    ? undefined
    : (self as unknown as {
        onmessage: ((event: MessageEvent<TreasureHuntStatsWorkerRequest>) => void) | null;
        postMessage: (message: TreasureHuntStatsWorkerResponse) => void;
      });

if (workerScope) {
  const runtime = new TreasureHuntStatsWorkerRuntime({ postMessage: (message) => workerScope.postMessage(message) });
  workerScope.onmessage = (event) => {
    if (event.data.type === "schedule") {
      runtime.schedule(event.data);
    }
  };
}
