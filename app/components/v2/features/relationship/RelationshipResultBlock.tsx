import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { HeartIcon } from "@heroicons/react/24/solid";
import { type ReactNode, useEffect, useState } from "react";
import type { RelationshipShortfallRow as RelationshipShortfallRowData } from "~/domain/relationship-gifts";
import { Button } from "../../primitives/Button";
import { Skeleton } from "../../primitives/Skeleton";
import { RelationshipShortfallRow } from "./RelationshipShortfallRow";

const formatNumber = (value: number) => value.toLocaleString("en-US");

type ResultData = {
  expectedLevel: number;
  nextRankExp: number | null;
  remainingExp: number;
  excessExp: number;
  reached: boolean;
};

export function RelationshipResultBlock({
  rankInputs,
  state,
  result,
  targetLevel,
  shortfallRows,
  inventoryMode,
  excludeOtherStudents,
  pendingMessage,
  onRetry,
}: {
  rankInputs: ReactNode;
  state: "loading" | "error" | "ready";
  result: ResultData | null;
  targetLevel: number | null;
  shortfallRows: RelationshipShortfallRowData[];
  inventoryMode: boolean;
  excludeOtherStudents: boolean;
  pendingMessage: string;
  onRetry: () => void;
}) {
  const summary = result
    ? result.reached
      ? `도달 랭크 ${result.expectedLevel}, 목표 ${targetLevel}랭크 도달 완료, ${formatNumber(result.excessExp)} EXP 초과`
      : `도달 랭크 ${result.expectedLevel}, 다음 랭크까지 ${formatNumber(result.nextRankExp ?? 0)} EXP, 목표까지 ${formatNumber(result.remainingExp)} EXP 남음`
    : "";
  const [liveSummary, setLiveSummary] = useState("");

  useEffect(() => {
    if (!summary) {
      setLiveSummary("");
      return;
    }
    const timer = setTimeout(() => setLiveSummary(summary), 500);
    return () => clearTimeout(timer);
  }, [summary]);

  return (
    <div className="space-y-v2-block-gap">
      <section aria-label="인연 랭크" className="space-y-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p">
        {rankInputs}
        <section aria-label="계산 결과">
          {inventoryMode ? (
            <p className="mb-3 text-xs text-v2-fg-tertiary">
              보유 선물 기준{excludeOtherStudents ? " · 다른 학생 배정분 제외" : ""}
            </p>
          ) : null}
          {state === "loading" ? (
            <section className="grid grid-cols-2 gap-3" aria-label="계산 결과 불러오는 중">
              {[0, 1].map((column) => (
                <div key={column} className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-full max-w-40" />
                  <Skeleton className="h-4 w-full max-w-32" />
                </div>
              ))}
            </section>
          ) : state === "error" ? (
            <div className="flex flex-wrap items-center justify-between gap-3" role="alert">
              <p className="text-sm font-medium text-v2-fg">선물 정보를 불러오지 못해 계산할 수 없어요.</p>
              <Button onClick={onRetry} className="min-h-9">
                다시 시도
              </Button>
            </div>
          ) : !result ? (
            <p className="py-1 text-sm text-v2-fg-secondary">{pendingMessage}</p>
          ) : (
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-v2-fg-tertiary">도달 랭크</p>
                <p className="mt-1 flex items-center gap-2 text-3xl font-bold leading-none tabular-nums text-v2-fg">
                  <span role="img" aria-label="인연 하트">
                    <HeartIcon aria-hidden="true" className="size-6 shrink-0 text-v2-bond" />
                  </span>
                  {result.expectedLevel}
                </p>
                <p className="mt-2 text-sm text-v2-fg-secondary">
                  {result.nextRankExp == null ? "최고 랭크" : `다음 랭크까지 ${formatNumber(result.nextRankExp)} EXP`}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-v2-fg-tertiary">목표 {targetLevel}랭크까지</p>
                {result.reached ? (
                  <>
                    <p className="mt-1 flex h-7.5 items-center gap-1.5 text-2xl font-semibold leading-none text-v2-success">
                      <CheckCircleIcon aria-hidden="true" className="size-6 shrink-0" /> 도달 완료
                    </p>
                    <p className="mt-2 break-keep text-sm text-v2-fg-secondary">
                      목표 {targetLevel}랭크 · {formatNumber(result.excessExp)} EXP 초과
                    </p>
                  </>
                ) : (
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-3xl font-bold leading-none tabular-nums text-v2-fg">
                    <span className="whitespace-nowrap">{formatNumber(result.remainingExp)}</span>
                    <span className="text-sm font-medium text-v2-fg-secondary">EXP</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </section>
      {state === "loading" ? (
        <section aria-label="필요한 선물 불러오는 중" className="space-y-3 rounded-lg bg-v2-surface p-v2-block-p">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </section>
      ) : state === "ready" && result ? (
        <section aria-label="목표까지 필요한 선물" className="min-w-0 rounded-lg bg-v2-surface p-v2-block-p">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-v2-fg">목표까지 필요한 선물</h2>
            {!result.reached ? <span className="shrink-0 text-xs text-v2-fg-tertiary">한 종류로만 채울 때</span> : null}
          </div>
          {result.reached ? (
            <p className="py-2 text-sm text-v2-fg-secondary">목표 랭크에 도달해서 더 필요한 선물이 없어요.</p>
          ) : (
            <>
              <div className="grid grid-cols-[minmax(4rem,auto)_4rem_minmax(0,1fr)] gap-x-2">
                {shortfallRows.map((row) => (
                  <RelationshipShortfallRow key={row.exp} row={row} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-v2-fg-tertiary">
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden="true">
                    <img
                      src="/icons/menu-cafe.webp"
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="size-4.5 shrink-0 object-contain"
                    />
                  </span>
                  카페 {formatNumber(Math.ceil(result.remainingExp / 15))}번
                </span>
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden="true">
                    <img
                      src="/icons/menu-schedule.webp"
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="size-4.5 shrink-0 object-contain"
                    />
                  </span>
                  스케줄 {formatNumber(Math.ceil(result.remainingExp / 25))}번
                </span>
              </div>
            </>
          )}
        </section>
      ) : null}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveSummary}
      </p>
    </div>
  );
}
