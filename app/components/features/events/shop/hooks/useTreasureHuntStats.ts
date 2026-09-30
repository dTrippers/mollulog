import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TREASURE_HUNT_ENGINE_VERSION,
  TREASURE_HUNT_TARGET_GAMES,
  type OpenedCellHistogram,
} from "~/domain/treasure-hunt";
import type {
  TreasureHuntStatsWorkerRequest,
  TreasureHuntStatsWorkerResponse,
} from "../treasure-hunt-stats-worker.shared";
import type { TreasureHuntHistogramState } from "../treasure-hunt";

type ScheduleItem = Extract<TreasureHuntStatsWorkerRequest, { type: "schedule" }>["items"][number];

const CACHE_PREFIX = "mollulog:treasure-hunt-stats";
const UI_PROGRESS_INTERVAL_MS = 1000;

function cacheKey(signature: string) {
  return `${CACHE_PREFIX}:v${TREASURE_HUNT_ENGINE_VERSION}:${signature}`;
}

function isHistogram(value: unknown): value is OpenedCellHistogram {
  if (typeof value !== "object" || value === null || !("minCells" in value) || !("counts" in value)) {
    return false;
  }
  const histogram = value as OpenedCellHistogram;
  return (
    Number.isSafeInteger(histogram.minCells) &&
    histogram.minCells >= 0 &&
    Array.isArray(histogram.counts) &&
    histogram.counts.length > 0 &&
    histogram.counts.every((count) => Number.isSafeInteger(count) && count >= 0) &&
    histogram.counts.reduce((total, count) => total + count, 0) === TREASURE_HUNT_TARGET_GAMES
  );
}

function readCachedHistogram(signature: string): OpenedCellHistogram | null {
  try {
    const serialized = localStorage.getItem(cacheKey(signature));
    if (!serialized) return null;
    const value: unknown = JSON.parse(serialized);
    return isHistogram(value) ? value : null;
  } catch {
    return null;
  }
}

function writeCachedHistogram(signature: string, histogram: OpenedCellHistogram) {
  try {
    localStorage.setItem(cacheKey(signature), JSON.stringify(histogram));
  } catch {
    // Storage is an optimization. A failure leaves the worker calculation usable.
  }
}

function isComplete(stats: TreasureHuntHistogramState | undefined): boolean {
  return !!stats && !stats.failed && !!stats.histogram && stats.completedGames >= stats.targetGames;
}

function mergeStats(
  current: Record<string, TreasureHuntHistogramState>,
  signature: string,
  stats: TreasureHuntHistogramState,
): Record<string, TreasureHuntHistogramState> {
  const next = { ...current, [signature]: stats };
  return next;
}

export function useTreasureHuntStats(items: ScheduleItem[], enabled = true) {
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const itemKey = items.map(({ signature }) => signature).join("\u001f");
  const [statsBySignature, setStatsBySignature] = useState<Record<string, TreasureHuntHistogramState>>({});
  const statsRef = useRef(statsBySignature);
  statsRef.current = statsBySignature;
  const [retryToken, setRetryToken] = useState(0);
  const [workerGeneration, setWorkerGeneration] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const workerUnavailableRef = useRef(false);
  const lastUiProgressAtRef = useRef<number | null>(null);
  const queuedProgressRef = useRef<Record<string, Extract<TreasureHuntStatsWorkerResponse, { type: "progress" }>>>({});
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateStats = useCallback((signature: string, stats: TreasureHuntHistogramState) => {
    setStatsBySignature((current) => {
      const next = mergeStats(current, signature, stats);
      statsRef.current = next;
      return next;
    });
  }, []);

  const flushProgress = useCallback(() => {
    progressTimerRef.current = null;
    const queued = Object.values(queuedProgressRef.current);
    queuedProgressRef.current = {};
    if (queued.length === 0) return;
    for (const message of queued) {
      updateStats(message.signature, {
        histogram: message.histogram,
        completedGames: message.completedGames,
        targetGames: message.targetGames,
      });
    }
    lastUiProgressAtRef.current = Date.now();
  }, [updateStats]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Worker generation intentionally recreates the worker after retry.
  useEffect(() => {
    if (!enabled) return;

    let worker: Worker;
    try {
      worker = new Worker(new URL("../treasure-hunt-stats.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      workerUnavailableRef.current = false;
    } catch {
      workerRef.current = null;
      workerUnavailableRef.current = true;
      for (const { signature } of itemsRef.current) {
        updateStats(signature, {
          completedGames: 0,
          targetGames: TREASURE_HUNT_TARGET_GAMES,
          failed: true,
        });
      }
      return;
    }

    worker.onmessage = (event: MessageEvent<TreasureHuntStatsWorkerResponse>) => {
      const message = event.data;
      if (message.type === "progress") {
        queuedProgressRef.current[message.signature] = message;
        const lastUpdatedAt = lastUiProgressAtRef.current;
        if (lastUpdatedAt === null || Date.now() - lastUpdatedAt >= UI_PROGRESS_INTERVAL_MS) {
          flushProgress();
        } else if (progressTimerRef.current === null) {
          progressTimerRef.current = setTimeout(
            flushProgress,
            Math.max(0, UI_PROGRESS_INTERVAL_MS - (Date.now() - lastUpdatedAt)),
          );
        }
        return;
      }

      if (message.type === "done") {
        queuedProgressRef.current[message.signature] = {
          type: "progress",
          signature: message.signature,
          completedGames: message.targetGames,
          targetGames: message.targetGames,
          histogram: message.histogram,
        };
        if (progressTimerRef.current) {
          clearTimeout(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        flushProgress();
        writeCachedHistogram(message.signature, message.histogram);
        return;
      }

      if (message.type === "error") {
        delete queuedProgressRef.current[message.signature];
        updateStats(message.signature, {
          completedGames: 0,
          targetGames: TREASURE_HUNT_TARGET_GAMES,
          failed: true,
        });
      }
    };

    worker.onerror = () => {
      workerUnavailableRef.current = true;
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      queuedProgressRef.current = {};
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      for (const { signature } of itemsRef.current) {
        updateStats(signature, {
          completedGames: 0,
          targetGames: TREASURE_HUNT_TARGET_GAMES,
          failed: true,
        });
      }
    };

    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, [enabled, flushProgress, updateStats, workerGeneration]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: These values intentionally trigger scheduling while the latest items and worker live in refs.
  useEffect(() => {
    if (!enabled) return;
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) return;

    const missing: ScheduleItem[] = [];
    for (const item of currentItems) {
      let stats = statsRef.current[item.signature];
      if (!isComplete(stats) && !stats?.failed) {
        const cached = readCachedHistogram(item.signature);
        if (cached) {
          stats = {
            histogram: cached,
            completedGames: TREASURE_HUNT_TARGET_GAMES,
            targetGames: TREASURE_HUNT_TARGET_GAMES,
          };
          updateStats(item.signature, stats);
        }
      }
      if (!isComplete(stats) && !stats?.failed) {
        missing.push(item);
      }
    }

    if (missing.length === 0) return;
    const worker = workerRef.current;
    if (!worker && workerUnavailableRef.current) {
      setWorkerGeneration((generation) => generation + 1);
      workerUnavailableRef.current = false;
      return;
    }
    if (!worker) return;
    try {
      worker.postMessage({ type: "schedule", items: missing });
    } catch {
      for (const { signature } of missing) {
        updateStats(signature, {
          completedGames: 0,
          targetGames: TREASURE_HUNT_TARGET_GAMES,
          failed: true,
        });
      }
    }
  }, [enabled, itemKey, retryToken, updateStats, workerGeneration]);

  const retry = useCallback(() => {
    const required = new Set(itemsRef.current.map(({ signature }) => signature));
    setStatsBySignature((current) => {
      const next = { ...current };
      for (const signature of required) {
        if (next[signature]?.failed) delete next[signature];
      }
      statsRef.current = next;
      return next;
    });
    if (workerUnavailableRef.current || !workerRef.current) {
      setWorkerGeneration((generation) => generation + 1);
      workerUnavailableRef.current = false;
    }
    setRetryToken((token) => token + 1);
  }, []);

  const progress = useMemo(() => {
    const signatures = [...new Set(items.map(({ signature }) => signature))];
    if (!enabled || signatures.length === 0) return null;
    let completedGames = 0;
    let targetGames = 0;
    for (const signature of signatures) {
      const stats = statsBySignature[signature];
      if (stats?.failed) continue;
      completedGames += Math.min(stats?.completedGames ?? 0, stats?.targetGames ?? TREASURE_HUNT_TARGET_GAMES);
      targetGames += stats?.targetGames ?? TREASURE_HUNT_TARGET_GAMES;
    }
    return targetGames > 0 ? Math.floor((completedGames / targetGames) * 100) : 0;
  }, [enabled, items, statsBySignature]);

  return { statsBySignature, progress, retry };
}
