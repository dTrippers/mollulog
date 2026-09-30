import {
  createTreasureHuntSimulator,
  InvalidTreasureHuntCompositionError,
  isValidTreasureHuntComposition,
  type OpenedCellHistogram,
  TREASURE_HUNT_TARGET_GAMES,
  type TreasureHuntComposition,
  type TreasureHuntSimulator,
  treasureHuntCompositionSignature,
} from "~/domain/treasure-hunt";
import type {
  TreasureHuntStatsScheduleItem,
  TreasureHuntStatsWorkerRequest,
  TreasureHuntStatsWorkerResponse,
} from "./treasure-hunt-stats-worker.shared";

const DEFAULT_BATCH_SIZE = 8;
const INITIAL_BATCH_GAMES = 8;
const MAX_COMPLETED_HISTOGRAMS = 4;
const MIN_PROGRESS_INTERVAL_MS = 250;

type SimulatorFactory = (composition: TreasureHuntComposition) => TreasureHuntSimulator;

type RuntimeOptions = {
  postMessage: (message: TreasureHuntStatsWorkerResponse) => void;
  createSimulator?: SimulatorFactory;
  batchSize?: number;
  now?: () => number;
  yieldToEventLoop?: () => Promise<void>;
};

type WorkProgress = {
  item: TreasureHuntStatsScheduleItem;
  simulator?: TreasureHuntSimulator;
  minCells: number;
  boardCells: number;
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
  private readonly completedThisSchedule = new Set<string>();
  private readonly workProgress = new Map<string, WorkProgress>();
  private readonly failedThisSchedule = new Set<string>();
  private requested: TreasureHuntStatsScheduleItem[] = [];
  private pending: TreasureHuntStatsScheduleItem[] = [];
  private bootstrapQueue: string[] = [];
  private bootstrapping = false;
  private firstStartedSignature: string | null = null;
  private active: WorkProgress | null = null;
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

    this.completedThisSchedule.clear();
    this.failedThisSchedule.clear();
    const seen = new Set<string>();
    const nextRequested: TreasureHuntStatsScheduleItem[] = [];
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

      const completedHistogram = this.readCompletedHistogram(item.signature);
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
        nextRequested.push(item);
        continue;
      }
      nextRequested.push(item);
    }

    this.requested = nextRequested;
    this.pruneWorkProgress();

    const compositionsNeedingBootstrap = nextRequested.filter((item) => {
      const progress = this.workProgress.get(item.signature);
      return !progress || progress.completedGames < INITIAL_BATCH_GAMES;
    });
    if (compositionsNeedingBootstrap.length > 0) {
      this.bootstrapQueue = compositionsNeedingBootstrap.map(({ signature }) => signature);
      this.bootstrapping = true;
      // Keep accumulated counts while releasing the potentially large simulator cache.
      if (this.active) {
        this.active.simulator = undefined;
        this.active = null;
      }
    } else {
      this.bootstrapQueue = [];
      this.bootstrapping = false;
    }

    // An already-started composition stays first; only unstarted work follows the latest request order.
    this.refreshPending();
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
    this.processing = this.processQueue()
      .catch(() => undefined)
      .then(() => {
        this.processing = null;
        if (this.active || this.pending.length > 0) {
          this.startProcessing();
        }
      });
  }

  private async processQueue(): Promise<void> {
    while (this.active || this.pending.length > 0 || this.bootstrapping) {
      if (!this.active) {
        let item = this.bootstrapping ? this.nextBootstrapItem() : undefined;
        if (this.bootstrapping && !item) {
          this.bootstrapping = false;
          this.bootstrapQueue = [];
          this.refreshPending();
        }
        item ??= this.pending.shift();
        if (!item) {
          return;
        }
        const progress = this.getOrCreateProgress(item);
        if (!progress) continue;
        this.active = progress;
        this.firstStartedSignature ??= item.signature;
      }

      const work = this.active;
      if (!work) {
        continue;
      }
      try {
        const simulator = this.getSimulator(work);
        const batchSize = this.bootstrapping ? INITIAL_BATCH_GAMES : this.batchSize;
        const batchEnd = Math.min(work.completedGames + batchSize, TREASURE_HUNT_TARGET_GAMES);
        while (work.completedGames < batchEnd) {
          const openedCells = simulator.simulateGame(work.completedGames);
          const histogramIndex = openedCells - work.minCells;
          const currentCount = work.counts[histogramIndex];
          if (
            !Number.isSafeInteger(openedCells) ||
            openedCells < work.minCells ||
            openedCells > work.boardCells ||
            histogramIndex < 0 ||
            currentCount === undefined
          ) {
            throw new Error("Simulation returned an invalid opened-cell count.");
          }
          work.counts[histogramIndex] = currentCount + 1;
          work.completedGames++;
        }

        const now = this.now();
        if (
          this.bootstrapping ||
          work.lastProgressAt === null ||
          now - work.lastProgressAt >= MIN_PROGRESS_INTERVAL_MS
        ) {
          this.postMessage({
            type: "progress",
            signature: work.item.signature,
            completedGames: work.completedGames,
            targetGames: TREASURE_HUNT_TARGET_GAMES,
            histogram: this.histogramFor(work),
          });
          work.lastProgressAt = now;
        }

        const reachedTarget = work.completedGames === TREASURE_HUNT_TARGET_GAMES;
        if (reachedTarget) {
          const histogram = this.histogramFor(work);
          this.rememberCompletedHistogram(work.item.signature, histogram);
          this.completedThisSchedule.add(work.item.signature);
          this.workProgress.delete(work.item.signature);
          this.postMessage({
            type: "done",
            signature: work.item.signature,
            histogram,
            targetGames: TREASURE_HUNT_TARGET_GAMES,
          });
          if (this.firstStartedSignature === work.item.signature) {
            this.firstStartedSignature = null;
          }
          this.active = null;
          this.refreshPending();
        } else if (this.bootstrapping) {
          // Only retain the compact histogram counts between compositions, never multiple simulators.
          work.simulator = undefined;
          this.active = null;
        }

        // A task-queue yield lets incoming schedule messages reorder the pending compositions.
        await this.yieldToEventLoop();
      } catch {
        this.postError(work.item.signature, "engine-failure");
        this.failedThisSchedule.add(work.item.signature);
        this.workProgress.delete(work.item.signature);
        if (this.firstStartedSignature === work.item.signature) {
          this.firstStartedSignature = null;
        }
        this.active = null;
        this.refreshPending();
      }
    }
  }

  private getOrCreateProgress(item: TreasureHuntStatsScheduleItem): WorkProgress | null {
    const existing = this.workProgress.get(item.signature);
    if (existing) {
      existing.item = item;
      return existing;
    }

    try {
      const simulator = this.createSimulator(item.composition);
      const progress: WorkProgress = {
        item,
        simulator,
        minCells: simulator.minCells,
        boardCells: simulator.boardCells,
        completedGames: 0,
        counts: Array(simulator.boardCells - simulator.minCells + 1).fill(0),
        lastProgressAt: null,
      };
      this.workProgress.set(item.signature, progress);
      return progress;
    } catch (error) {
      this.postError(
        item.signature,
        error instanceof InvalidTreasureHuntCompositionError ? "invalid-composition" : "engine-failure",
      );
      this.failedThisSchedule.add(item.signature);
      if (this.firstStartedSignature === item.signature) {
        this.firstStartedSignature = null;
      }
      return null;
    }
  }

  private getSimulator(work: WorkProgress): TreasureHuntSimulator {
    if (work.simulator) return work.simulator;

    const simulator = this.createSimulator(work.item.composition);
    if (simulator.minCells !== work.minCells || simulator.boardCells !== work.boardCells) {
      throw new Error("Resumed simulation has a different board shape.");
    }
    work.simulator = simulator;
    return simulator;
  }

  private nextBootstrapItem(): TreasureHuntStatsScheduleItem | undefined {
    while (this.bootstrapQueue.length > 0) {
      const signature = this.bootstrapQueue.shift();
      if (!signature) continue;
      if (this.failedThisSchedule.has(signature)) continue;
      const progress = this.workProgress.get(signature);
      if (progress && progress.completedGames >= INITIAL_BATCH_GAMES) continue;
      const item = this.requested.find((candidate) => candidate.signature === signature) ?? progress?.item;
      if (item) return item;
    }
    return undefined;
  }

  private refreshPending(): void {
    const next: TreasureHuntStatsScheduleItem[] = [];
    const seen = new Set<string>();
    const append = (item: TreasureHuntStatsScheduleItem | undefined) => {
      if (!item || seen.has(item.signature) || this.active?.item.signature === item.signature) return;
      if (this.failedThisSchedule.has(item.signature)) return;
      if (this.completedThisSchedule.has(item.signature)) return;
      if (this.completed.has(item.signature)) return;
      seen.add(item.signature);
      next.push(item);
    };

    if (this.firstStartedSignature) {
      append(this.workProgress.get(this.firstStartedSignature)?.item);
    }
    for (const item of this.requested) append(item);
    this.pending = next;
  }

  private pruneWorkProgress(): void {
    const keep = new Set(this.requested.map(({ signature }) => signature));
    if (this.firstStartedSignature) keep.add(this.firstStartedSignature);
    if (this.active) keep.add(this.active.item.signature);
    for (const signature of this.workProgress.keys()) {
      if (!keep.has(signature)) this.workProgress.delete(signature);
    }
  }

  private readCompletedHistogram(signature: string): OpenedCellHistogram | undefined {
    const histogram = this.completed.get(signature);
    if (!histogram) return undefined;
    this.completed.delete(signature);
    this.completed.set(signature, histogram);
    return histogram;
  }

  private rememberCompletedHistogram(signature: string, histogram: OpenedCellHistogram): void {
    this.completed.delete(signature);
    this.completed.set(signature, cloneHistogram(histogram));
    while (this.completed.size > MAX_COMPLETED_HISTOGRAMS) {
      const oldest = this.completed.keys().next().value;
      if (oldest === undefined) return;
      this.completed.delete(oldest);
    }
  }

  private histogramFor(work: WorkProgress): OpenedCellHistogram {
    return { minCells: work.minCells, counts: [...work.counts] };
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
