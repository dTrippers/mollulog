import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Button, Callout, Progress } from "~/components/primitives";
import {
  CACHE_REFRESH_TASK_LABELS,
  CACHE_REFRESH_TASK_NAMES,
  type CacheRefreshJob,
  type CacheRefreshTaskName,
  type CacheRefreshTaskResult,
  isCacheRefreshJobActive,
} from "~/domain/cache-refresh";
import { formatInstant } from "~/lib/date-time";
import type { action, loader } from "../[__manage]";

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null) {
    return null;
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}초`;
}

function formatDate(value: string): string {
  return formatInstant(value, { timeZone: "Asia/Seoul", format: "YYYY. M. D. A h:mm:ss" });
}

function getTaskIcon(job: CacheRefreshJob, name: CacheRefreshTaskName, result: CacheRefreshTaskResult) {
  if (result.status === "succeeded") {
    return <CheckCircleIcon className="size-5 shrink-0 text-green-500" />;
  }
  if (result.status === "failed") {
    return <ExclamationTriangleIcon className="size-5 shrink-0 text-destructive" />;
  }
  if (result.status === "skipped") {
    return <MinusCircleIcon className="size-5 shrink-0 text-muted-foreground" />;
  }
  if (job.currentTask === name) {
    return <ArrowPathIcon className="size-5 shrink-0 animate-spin text-primary" />;
  }
  return <ClockIcon className="size-5 shrink-0 text-muted-foreground/60" />;
}

function getStatusText(job: CacheRefreshJob): string {
  switch (job.status) {
    case "queued":
      return "실행 대기 중";
    case "running":
      return "캐시를 갱신하고 있어요.";
    case "completed":
      return "모든 캐시 갱신을 완료했어요.";
    case "partial_failure":
      return "일부 캐시를 갱신하지 못했어요.";
    case "failed":
      return "캐시 갱신 작업을 완료하지 못했어요.";
  }
}

function JobResultCallout({ job }: { job: CacheRefreshJob }) {
  if (job.status === "completed") {
    return (
      <Callout
        Icon={CheckCircleIcon}
        tone="success"
        title="Cache refresh 완료"
        description={job.finishedAt ? `${formatDate(job.finishedAt)}에 완료했습니다.` : "모든 작업을 완료했습니다."}
      />
    );
  }
  if (job.status === "partial_failure" || job.status === "failed") {
    return (
      <Callout
        Icon={ExclamationTriangleIcon}
        tone={job.status === "failed" ? "destructive" : "warning"}
        title={job.status === "failed" ? "Cache refresh 실패" : "Cache refresh 일부 실패"}
        description={`상세 로그를 확인할 때 job ID ${job.uid}를 사용해주세요.`}
      />
    );
  }
  return null;
}

export function CacheRefreshPanel({
  initialJob,
  initialError,
}: {
  initialJob: CacheRefreshJob | null;
  initialError: string | null;
}) {
  const startFetcher = useFetcher<typeof action>();
  const statusFetcher = useFetcher<typeof loader>();
  const actionJob =
    startFetcher.data?.intent === "cache.refresh" && "job" in startFetcher.data ? startFetcher.data.job : null;
  const [trackedJobUid, setTrackedJobUid] = useState(initialJob?.uid ?? null);
  const desiredJobUid = actionJob?.uid ?? trackedJobUid;
  const polledJob = statusFetcher.data?.job?.uid === desiredJobUid ? statusFetcher.data.job : null;
  const job = polledJob ?? actionJob ?? (initialJob?.uid === desiredJobUid ? initialJob : null);
  const isActive = job ? isCacheRefreshJobActive(job.status) : false;
  const isStarting = startFetcher.state !== "idle";
  const actionError = startFetcher.data && "error" in startFetcher.data ? startFetcher.data.error : null;
  const statusError = statusFetcher.data ? statusFetcher.data.error : initialError;

  useEffect(() => {
    if (actionJob) {
      setTrackedJobUid(actionJob.uid);
    }
  }, [actionJob]);

  useEffect(() => {
    if (!job || !isActive || statusFetcher.state !== "idle") {
      return;
    }

    const delayMs = document.visibilityState === "hidden" ? 8000 : 2000;
    const timer = window.setTimeout(() => {
      statusFetcher.load(`/__manage?jobId=${encodeURIComponent(job.uid)}`);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [isActive, job, statusFetcher.load, statusFetcher.state]);

  const ratio = job && job.totalCount > 0 ? job.completedCount / job.totalCount : 0;

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">Cache refresh</h2>
            <p className="mt-1 text-sm text-muted-foreground">BAQL 기반 캐시를 background job으로 다시 생성합니다.</p>
          </div>
          <startFetcher.Form method="post">
            <Button
              type="submit"
              name="intent"
              value="cache.refresh"
              variant="primary"
              icon={ArrowPathIcon}
              text={isStarting ? "Starting..." : isActive ? "Refresh in progress" : "Refresh cache"}
              disabled={isStarting || isActive}
            />
          </startFetcher.Form>
        </div>
      </section>

      {(actionError || statusError) && (
        <Callout
          Icon={ExclamationTriangleIcon}
          tone="destructive"
          title="진행 상태를 불러오지 못했어요."
          description={actionError ?? statusError ?? undefined}
        />
      )}

      {job && (
        <section className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{getStatusText(job)}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(job.startedAt ?? job.createdAt)} · job ID {job.uid}
              </p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {job.completedCount} / {job.totalCount}
            </span>
          </div>

          <div className="mt-4">
            <Progress
              ratio={ratio}
              color={job.status === "failed" || job.status === "partial_failure" ? "orange" : "blue"}
            />
          </div>

          <div className="mt-5 divide-y divide-border rounded-md border border-border">
            {CACHE_REFRESH_TASK_NAMES.map((name) => {
              const result = job.taskResults[name];
              return (
                <div key={name} className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    {getTaskIcon(job, name, result)}
                    <span className={result.status === "skipped" ? "truncate text-muted-foreground" : "truncate"}>
                      {CACHE_REFRESH_TASK_LABELS[name]}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDuration(result.durationMs) ?? (result.status === "skipped" ? "건너뜀" : "")}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {job && <JobResultCallout job={job} />}
    </div>
  );
}
