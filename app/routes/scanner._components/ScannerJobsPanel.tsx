import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import {
  ScannerJobList,
  type ScannerJobListItem,
  type ScannerJobTone,
} from "~/components/v2/features/scanner/ScannerJobList";
import { Button } from "~/components/v2/primitives/Button";
import { Skeleton } from "~/components/v2/primitives/Skeleton";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { formatScannerRelativeTime, getScannerJobStatusLabel } from "./scanner-messages";

const SCANNER_JOBS_UPDATED_EVENT = "scanner-jobs-updated";
const ACTIVE_JOB_STATUSES = new Set(["queued", "processing", "finalizing"]);

export type ScannerJobSummary = {
  uid: string;
  jobKind: "item_inventory_images_v1" | "student_detail_images_v1" | "student_detail_video_v1";
  status: string;
  progress: { completed: number; failed: number; total: number };
  application: { status: string; appliedAt: string | null } | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type ScannerJobsResponse = {
  jobs: ScannerJobSummary[];
};

export type ScannerJobStatusUpdate = Pick<ScannerJobSummary, "uid" | "status" | "updatedAt">;

function isScannerJobStateNewer(
  candidate: Pick<ScannerJobSummary, "updatedAt">,
  current: Pick<ScannerJobSummary, "updatedAt">,
): boolean {
  const candidateTime = Date.parse(candidate.updatedAt);
  const currentTime = Date.parse(current.updatedAt);
  if (Number.isFinite(candidateTime) && Number.isFinite(currentTime)) return candidateTime > currentTime;
  return candidate.updatedAt > current.updatedAt;
}

export function applyScannerJobStatusUpdate(
  jobs: ReadonlyArray<ScannerJobSummary>,
  update: ScannerJobStatusUpdate,
): ScannerJobSummary[] {
  return jobs.map((job) =>
    job.uid === update.uid && isScannerJobStateNewer(update, job)
      ? { ...job, status: update.status, updatedAt: update.updatedAt }
      : job,
  );
}

export function mergeScannerJobsWithStatusUpdates(
  jobs: ReadonlyArray<ScannerJobSummary>,
  updates: ReadonlyMap<string, ScannerJobStatusUpdate>,
): ScannerJobSummary[] {
  return jobs.map((job) => {
    const update = updates.get(job.uid);
    return update && isScannerJobStateNewer(update, job)
      ? { ...job, status: update.status, updatedAt: update.updatedAt }
      : job;
  });
}

export function mergeScannerJobsPreservingSelected(
  current: ReadonlyArray<ScannerJobSummary>,
  next: ReadonlyArray<ScannerJobSummary>,
  selectedJobUid: string | null,
): ScannerJobSummary[] {
  if (!selectedJobUid) return [...next];
  const currentByUid = new Map(current.map((job) => [job.uid, job]));
  return next.map((job) => {
    const currentJob = currentByUid.get(job.uid);
    return currentJob && isScannerJobStateNewer(currentJob, job) ? currentJob : job;
  });
}

export function notifyScannerJobsChanged(update?: ScannerJobStatusUpdate) {
  window.dispatchEvent(
    new CustomEvent<ScannerJobStatusUpdate | undefined>(SCANNER_JOBS_UPDATED_EVENT, { detail: update }),
  );
}

// The list tone follows the same split as the label: an expired upload is a failure, and so is a failed recognition.
export function getScannerJobTone(status: string, isApplied: boolean): ScannerJobTone {
  if (isApplied) return "done";
  if (status === "review_ready") return "review";
  if (status === "queued") return "waiting";
  if (status === "processing" || status === "finalizing") return "processing";
  if (status === "expired" || status === "failed") return "failed";
  return "waiting";
}

export default function ScannerJobsPanel() {
  const location = useLocation();
  const [jobs, setJobs] = useState<ScannerJobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const latestStatusUpdatesRef = useRef(new Map<string, ScannerJobStatusUpdate>());
  const selectedJobUid = new URLSearchParams(location.search).get("job");
  const hasBackgroundActiveJobs = useMemo(
    () => jobs.some((job) => job.uid !== selectedJobUid && ACTIVE_JOB_STATUSES.has(job.status)),
    [jobs, selectedJobUid],
  );

  const loadJobs = useCallback(
    async (preserveSelected = false) => {
      try {
        const response = await fetch("/api/ocr/jobs?jobKind=all");
        const body = (await response.json().catch(() => null)) as (ScannerJobsResponse & { error?: string }) | null;
        if (!response.ok) throw new Error(body?.error ?? "진행 상황을 불러오지 못했어요");
        const nextJobs = body?.jobs ?? [];
        for (const job of nextJobs) {
          const nextUpdate: ScannerJobStatusUpdate = {
            uid: job.uid,
            status: job.status,
            updatedAt: job.updatedAt,
          };
          const previousUpdate = latestStatusUpdatesRef.current.get(job.uid);
          if (!previousUpdate || isScannerJobStateNewer(nextUpdate, previousUpdate)) {
            latestStatusUpdatesRef.current.set(job.uid, nextUpdate);
          }
        }
        const recencyMergedJobs = mergeScannerJobsWithStatusUpdates(nextJobs, latestStatusUpdatesRef.current);
        setJobs((current) =>
          preserveSelected
            ? mergeScannerJobsPreservingSelected(current, recencyMergedJobs, selectedJobUid)
            : recencyMergedJobs,
        );
        setHasError(false);
      } catch {
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    },
    [selectedJobUid],
  );

  useEffect(() => {
    void loadJobs();
    const handleJobsChanged = (event: Event) => {
      const update = (event as CustomEvent<ScannerJobStatusUpdate | undefined>).detail;
      if (!update) {
        void loadJobs();
        return;
      }
      const previousUpdate = latestStatusUpdatesRef.current.get(update.uid);
      if (!previousUpdate || isScannerJobStateNewer(update, previousUpdate)) {
        latestStatusUpdatesRef.current.set(update.uid, update);
      }
      setJobs((current) => applyScannerJobStatusUpdate(current, update));
      setHasError(false);
    };
    window.addEventListener(SCANNER_JOBS_UPDATED_EVENT, handleJobsChanged);
    return () => window.removeEventListener(SCANNER_JOBS_UPDATED_EVENT, handleJobsChanged);
  }, [loadJobs]);

  useEffect(() => {
    if (!hasBackgroundActiveJobs) return;
    const interval = window.setInterval(() => void loadJobs(true), 3000);
    return () => window.clearInterval(interval);
  }, [hasBackgroundActiveJobs, loadJobs]);

  if (isLoading) {
    return <ScannerJobsSkeleton />;
  }

  if (hasError) {
    return (
      <StatusNotice
        tone="danger"
        action={
          <Button variant="text" onClick={() => void loadJobs()}>
            다시 시도
          </Button>
        }
      >
        진행 상황을 불러오지 못했어요.
      </StatusNotice>
    );
  }

  if (jobs.length === 0) {
    return <p className="py-2 text-sm text-v2-fg-tertiary">최근 인식 작업이 없어요.</p>;
  }

  const items: ScannerJobListItem[] = jobs.map((job) => {
    const isApplied = job.application?.status === "applied";
    return {
      uid: job.uid,
      kindLabel: jobKindLabel(job.jobKind),
      detail: `${jobInputLabel(job)} · ${formatScannerRelativeTime(job.createdAt)}`,
      statusLabel: getScannerJobStatusLabel(job.status, isApplied),
      tone: getScannerJobTone(job.status, isApplied),
      href: getJobLink(job),
      selected: selectedJobUid === job.uid && location.pathname === getJobLink(job).split("?")[0],
    };
  });
  return <ScannerJobList items={items} />;
}

function getJobLink(job: ScannerJobSummary) {
  const path = job.jobKind === "item_inventory_images_v1" ? "/scanner/resource" : "/scanner/student";
  return `${path}?job=${encodeURIComponent(job.uid)}`;
}

function jobKindLabel(jobKind: ScannerJobSummary["jobKind"]) {
  return jobKind === "item_inventory_images_v1" ? "아이템" : "학생 성장도";
}

function jobInputLabel(job: ScannerJobSummary) {
  if (job.jobKind === "item_inventory_images_v1" || job.jobKind === "student_detail_images_v1") {
    return `스크린샷 ${job.progress.total}장`;
  }
  return "동영상";
}

function ScannerJobsSkeleton() {
  return (
    <div className="flex flex-col gap-v2-list-gap" aria-busy="true">
      <p className="sr-only">진행 상황을 불러오는 중</p>
      {["first", "second", "third"].map((key) => (
        <div
          key={key}
          className="flex min-h-v2-row-min flex-col justify-center gap-1.5 py-v2-row-y"
          aria-hidden="true"
        >
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
