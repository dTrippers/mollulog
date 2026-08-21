import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { PanelActionRow, PanelBody } from "~/components/primitives";
import { cn } from "~/lib/utils";

const SCANNER_JOBS_UPDATED_EVENT = "scanner-jobs-updated";
const ACTIVE_JOB_STATUSES = new Set(["queued", "processing", "finalizing"]);

type ScannerJobSummary = {
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

export function notifyScannerJobsChanged() {
  window.dispatchEvent(new Event(SCANNER_JOBS_UPDATED_EVENT));
}

export default function ScannerJobsPanel() {
  const location = useLocation();
  const [jobs, setJobs] = useState<ScannerJobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const selectedJobUid = new URLSearchParams(location.search).get("job");
  const hasBackgroundActiveJobs = useMemo(
    () => jobs.some((job) => job.uid !== selectedJobUid && ACTIVE_JOB_STATUSES.has(job.status)),
    [jobs, selectedJobUid],
  );

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/ocr/jobs?jobKind=all");
      const body = (await response.json().catch(() => null)) as (ScannerJobsResponse & { error?: string }) | null;
      if (!response.ok) throw new Error(body?.error ?? "진행 상황을 불러오지 못했어요");
      setJobs(body?.jobs ?? []);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    const handleJobsChanged = () => void loadJobs();
    window.addEventListener(SCANNER_JOBS_UPDATED_EVENT, handleJobsChanged);
    return () => window.removeEventListener(SCANNER_JOBS_UPDATED_EVENT, handleJobsChanged);
  }, [loadJobs]);

  useEffect(() => {
    if (!hasBackgroundActiveJobs) return;
    const interval = window.setInterval(() => void loadJobs(), 3000);
    return () => window.clearInterval(interval);
  }, [hasBackgroundActiveJobs, loadJobs]);

  if (isLoading) {
    return <ScannerJobsSkeleton />;
  }

  if (hasError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-xs text-destructive">진행 상황을 불러오지 못했어요.</p>
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-destructive underline underline-offset-2"
          onClick={() => void loadJobs()}
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (jobs.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">최근 인식 작업이 없어요.</p>;
  }

  return (
    <PanelBody className="space-y-1.5">
      {jobs.map((job) => {
        const link = getJobLink(job);
        const isSelected = selectedJobUid === job.uid && location.pathname === link.split("?")[0];

        return (
          <Link
            key={job.uid}
            to={link}
            aria-current={isSelected ? "page" : undefined}
            className={cn(
              "block rounded-md border px-3 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
              isSelected
                ? "border-primary/50 bg-primary/5"
                : "border-border bg-background text-foreground hover:bg-muted/60",
            )}
          >
            <PanelActionRow
              title={jobKindLabel(job.jobKind)}
              description={`${jobInputLabel(job)} · ${formatRelativePastTime(job.createdAt)}`}
              actions={<JobStatusBadge job={job} />}
            />
          </Link>
        );
      })}
    </PanelBody>
  );
}

function JobStatusBadge({ job }: { job: ScannerJobSummary }) {
  const { label, className, animated } = getJobStatus(job);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full bg-current", animated && "animate-pulse")} aria-hidden="true" />
      {label}
    </span>
  );
}

function getJobStatus(job: ScannerJobSummary) {
  if (job.application?.status === "applied") {
    return {
      label: "반영 완료",
      className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      animated: false,
    };
  }
  if (job.status === "review_ready") {
    return {
      label: "검토 필요",
      className: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      animated: false,
    };
  }
  if (job.status === "queued") {
    return {
      label: "대기 중",
      className: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      animated: true,
    };
  }
  if (job.status === "processing" || job.status === "finalizing") {
    return {
      label: "인식 중",
      className: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      animated: true,
    };
  }
  if (job.status === "failed") {
    return {
      label: "인식 실패",
      className: "border-destructive/20 bg-destructive/10 text-destructive",
      animated: false,
    };
  }
  if (job.status === "cancelled") {
    return {
      label: "취소됨",
      className: "border-border bg-muted text-muted-foreground",
      animated: false,
    };
  }
  return {
    label: "처리 중",
    className: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    animated: true,
  };
}

function getJobLink(job: ScannerJobSummary) {
  const path = job.jobKind === "item_inventory_images_v1" ? "/scanner/resource" : "/scanner/student";
  return `${path}?job=${encodeURIComponent(job.uid)}`;
}

function jobKindLabel(jobKind: ScannerJobSummary["jobKind"]) {
  return jobKind === "item_inventory_images_v1" ? "아이템" : "학생 성장도";
}

function jobInputLabel(job: ScannerJobSummary) {
  if (job.jobKind === "item_inventory_images_v1") return `스크린샷 ${job.progress.total}장`;
  if (job.jobKind === "student_detail_images_v1") return `학생 이미지 ${job.progress.total}장`;
  return "동영상";
}

function formatRelativePastTime(value: string) {
  const createdAt = new Date(value).getTime();
  if (!Number.isFinite(createdAt)) return "-";
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
  if (elapsedMinutes < 1) return "방금";
  if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}시간 전`;
  return `${Math.floor(elapsedHours / 24)}일 전`;
}

function ScannerJobsSkeleton() {
  return (
    <PanelBody className="space-y-1.5">
      <p className="sr-only">진행 상황을 불러오는 중</p>
      {["first", "second", "third"].map((key) => (
        <div
          key={key}
          className="animate-pulse rounded-md border border-border bg-background px-3 py-0.5"
          aria-hidden="true"
        >
          <div className="flex min-h-8 items-center gap-2 py-1.5 lg:min-h-7 lg:gap-1.5">
            <div className="min-w-0 grow space-y-1.5">
              <div className="h-4 w-20 rounded-sm bg-muted" />
              <div className="h-3 w-24 rounded-sm bg-muted" />
            </div>
            <div className="h-6 w-16 rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </PanelBody>
  );
}
