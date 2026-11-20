import { useCallback, useEffect, useRef, useState } from "react";
import type { RaidRecordDefenseType, RaidRecordRaidType, RaidRecordServer } from "~/domain/raid-record";
import type { RaidChartScoreActionData } from "~/routes/api.raid-records.chart-score";
import type { RaidChartRecordContextView, RaidChartRecordView, RaidChartSeasonView } from "~/views/raid-records";

const SAVE_DELAY_MS = 1_000;
const TOAST_DURATION_MS = 2_500;
const SAVE_FAILED_MESSAGE = "저장하지 못했어요.";

// Where "내 점수" keeps the score:
// - local: in this browser only, as before records (guests, and seasons or defense types a record cannot take)
// - unstarted: in this browser only, because the season has not started on the Korean server
// - record: in the signed-in Sensei's record of the season
export type RaidChartMyScoreMode = "local" | "unstarted" | "record";

export type RaidChartSaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "failed"; message: string; retryable: boolean };

type SaveTarget = {
  server: RaidRecordServer;
  raidType: RaidRecordRaidType;
  seasonIndex: number;
  defenseType: RaidRecordDefenseType;
};

type SaveRequest = { target: SaveTarget; score: number | null };

class ChartScoreSaveError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export function parseChartScoreInput(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const score = Number.parseInt(digits, 10);
  return Number.isFinite(score) && score > 0 ? score : null;
}

export function formatChartScoreInput(value: string): string {
  const score = parseChartScoreInput(value);
  return score === null ? "" : score.toLocaleString();
}

function savedScoreOf(record: RaidChartRecordView | null, defenseType: string): number | null {
  return record?.scores.find((entry) => entry.defenseType === defenseType)?.score ?? null;
}

async function postChartScore({ target, score }: SaveRequest): Promise<RaidChartRecordView | null> {
  let response: Response;
  try {
    response = await fetch("/api/raid-records/chart-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...target, score }),
      // A save flushed while the Sensei leaves the page still reaches the server.
      keepalive: true,
    });
  } catch {
    throw new ChartScoreSaveError(SAVE_FAILED_MESSAGE, true);
  }
  let body: RaidChartScoreActionData;
  try {
    body = (await response.json()) as RaidChartScoreActionData;
  } catch {
    throw new ChartScoreSaveError(SAVE_FAILED_MESSAGE, true);
  }
  if (!body.ok) {
    // A 4xx names what is wrong with the score; trying the same score again cannot help.
    const retryable = response.status >= 500;
    throw new ChartScoreSaveError(retryable ? SAVE_FAILED_MESSAGE : body.message, retryable);
  }
  return body.record;
}

// The season chart's "내 점수" value, kept in the browser or saved to the Sensei's record a second after typing stops.
export function useRaidChartMyScore({
  storageKey,
  context,
  defenseType,
}: {
  storageKey: string;
  context: RaidChartRecordContextView | null;
  defenseType: string;
}) {
  const [server, setServer] = useState<RaidRecordServer>("kr");
  const [records, setRecords] = useState<Record<RaidRecordServer, RaidChartRecordView | null>>({
    kr: context?.kr.record ?? null,
    jp: context?.jp?.record ?? null,
  });
  useEffect(() => {
    setRecords({ kr: context?.kr.record ?? null, jp: context?.jp?.record ?? null });
  }, [context]);

  const side: RaidChartSeasonView | null = context ? (server === "jp" && context.jp ? context.jp : context.kr) : null;
  const recordDefenseType =
    side?.started && side.scoreDefenseTypes.find((entry) => entry === defenseType) ? (defenseType as RaidRecordDefenseType) : null;
  const mode: RaidChartMyScoreMode =
    context && side && recordDefenseType ? "record" : side?.server === "kr" && !side.started ? "unstarted" : "local";
  const record = side ? records[side.server] : null;
  const savedScore = mode === "record" ? savedScoreOf(record, defenseType) : null;
  const target: SaveTarget | null =
    mode === "record" && context && side && recordDefenseType
      ? { server: side.server, raidType: context.raidType, seasonIndex: side.seasonIndex, defenseType: recordDefenseType }
      : null;
  const valueKey = target
    ? `record:${target.server}:${target.raidType}:${target.seasonIndex}:${target.defenseType}`
    : `local:${storageKey}`;

  const [value, setValue] = useState("");
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<RaidChartSaveStatus>({ kind: "idle" });
  const [toastId, setToastId] = useState<number | null>(null);

  // The saved score the value starts from, read when the key changes rather than after every save.
  const savedScoreRef = useRef(savedScore);
  savedScoreRef.current = savedScore;
  useEffect(() => {
    if (valueKey.startsWith("record:")) {
      const saved = savedScoreRef.current;
      setValue(saved === null ? "" : saved.toLocaleString());
    } else {
      try {
        setValue(formatChartScoreInput(window.localStorage.getItem(storageKey) ?? ""));
      } catch {
        setValue("");
      }
    }
    setStatus({ kind: "idle" });
    setLoadedKey(valueKey);
  }, [valueKey, storageKey]);

  // Browser-only modes keep the score in localStorage, as before records.
  useEffect(() => {
    if (loadedKey !== valueKey || !valueKey.startsWith("local:")) return;
    try {
      if (value) window.localStorage.setItem(storageKey, value);
      else window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore localStorage errors.
    }
  }, [value, valueKey, loadedKey, storageKey]);

  const inFlightRef = useRef(false);
  const queuedRef = useRef<SaveRequest | null>(null);
  const lastFailedRef = useRef<SaveRequest | null>(null);
  const send = useCallback(async (request: SaveRequest) => {
    // One save at a time, so an older score can never land after a newer one.
    if (inFlightRef.current) {
      queuedRef.current = request;
      return;
    }
    inFlightRef.current = true;
    setStatus({ kind: "saving" });
    try {
      const saved = await postChartScore(request);
      setRecords((current) => ({ ...current, [request.target.server]: saved }));
      setStatus({ kind: "idle" });
      if (request.score !== null) setToastId(Date.now());
    } catch (error) {
      const failure =
        error instanceof ChartScoreSaveError ? error : new ChartScoreSaveError(SAVE_FAILED_MESSAGE, true);
      setStatus({ kind: "failed", message: failure.message, retryable: failure.retryable });
      lastFailedRef.current = request;
    } finally {
      inFlightRef.current = false;
      const queued = queuedRef.current;
      queuedRef.current = null;
      if (queued) void send(queued);
    }
  }, []);

  useEffect(() => {
    if (toastId === null) return;
    const timer = setTimeout(() => setToastId(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toastId]);

  // A save waiting for the typing pause. Changing the defense type or server, or leaving the page, sends it at once.
  const pendingRef = useRef<{ timer: ReturnType<typeof setTimeout>; request: SaveRequest } | null>(null);
  const flushPending = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    void send(pending.request);
  }, [send]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new value key (defense type or server) is the trigger to flush
  useEffect(() => flushPending, [valueKey, flushPending]);

  const onChange = (nextInput: string) => {
    const next = formatChartScoreInput(nextInput);
    setValue(next);
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timer);
      pendingRef.current = null;
    }
    if (!target) return;
    const score = parseChartScoreInput(next);
    if (score === savedScore) {
      if (status.kind === "failed") setStatus({ kind: "idle" });
      return;
    }
    // Emptying the input removes the score only from a record that holds nothing but scores. Any other record keeps
    // its score, and the record line goes on showing it.
    if (score === null && !(record?.scoreOnly && savedScore !== null)) return;
    const request = { target, score };
    pendingRef.current = {
      request,
      timer: setTimeout(() => {
        pendingRef.current = null;
        void send(request);
      }, SAVE_DELAY_MS),
    };
  };

  const retry = () => {
    const failed = lastFailedRef.current;
    if (failed) void send(failed);
  };

  return {
    mode,
    server,
    // The server choice shows only when the Sensei has a record of the matching Japanese season.
    serverOptions: context?.jp ? { kr: context.kr.seasonIndex, jp: context.jp.seasonIndex } : null,
    selectServer: setServer,
    value: loadedKey === valueKey ? value : "",
    onChange,
    record: mode === "record" ? record : null,
    savedScore,
    status,
    retry,
    toastVisible: toastId !== null,
  };
}
