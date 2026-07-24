import { ArrowPathIcon, CheckCircleIcon, ClockIcon, FilmIcon, PlayIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Callout, Checkbox, SectionCard, SubTitle } from "~/components/primitives";
import { OCR_MAX_VIDEO_BYTES } from "~/domain/ocr";
import type {
  StudentDetailVideoResult,
  StudentVideoFieldName,
  StudentVideoFieldState,
} from "~/domain/student-video-ocr";
import { cn } from "~/lib/utils";
import { sha256File } from "./sha256";

type ApplyFieldName =
  | "tier"
  | "bond"
  | "level"
  | "weaponLevel"
  | "skillEx"
  | "skillNormal"
  | "skillEnhanced"
  | "skillSub"
  | "equip1"
  | "equip2"
  | "equip3"
  | "equipSpecial"
  | "abilityHp"
  | "abilityAtk"
  | "abilityHeal";

type FieldDefinition = {
  resultKey: StudentVideoFieldName;
  applyKey: ApplyFieldName;
  label: string;
  min: number;
  max: number;
};

const fields: readonly FieldDefinition[] = [
  { resultKey: "tier", applyKey: "tier", label: "성급", min: 1, max: 9 },
  { resultKey: "level", applyKey: "level", label: "학생 Lv", min: 1, max: 90 },
  { resultKey: "weaponLevel", applyKey: "weaponLevel", label: "고유무기 Lv", min: 0, max: 60 },
  { resultKey: "abilityHp", applyKey: "abilityHp", label: "HP 해방", min: 0, max: 25 },
  { resultKey: "abilityAtk", applyKey: "abilityAtk", label: "공격력 해방", min: 0, max: 25 },
  { resultKey: "abilityHeal", applyKey: "abilityHeal", label: "치유력 해방", min: 0, max: 25 },
  { resultKey: "skillEx", applyKey: "skillEx", label: "EX 스킬", min: 1, max: 5 },
  { resultKey: "skillNormal", applyKey: "skillNormal", label: "기본 스킬", min: 1, max: 10 },
  { resultKey: "skillEnhanced", applyKey: "skillEnhanced", label: "강화 스킬", min: 1, max: 10 },
  { resultKey: "skillSub", applyKey: "skillSub", label: "서브 스킬", min: 1, max: 10 },
  { resultKey: "equip1", applyKey: "equip1", label: "장비 1", min: 1, max: 10 },
  { resultKey: "equip2", applyKey: "equip2", label: "장비 2", min: 1, max: 10 },
  { resultKey: "equip3", applyKey: "equip3", label: "장비 3", min: 1, max: 10 },
  { resultKey: "equipSpecial", applyKey: "equipSpecial", label: "애용품", min: 1, max: 2 },
  { resultKey: "relationshipRank", applyKey: "bond", label: "인연 랭크", min: 1, max: 100 },
] as const;

type CurrentStudentState = Partial<Record<ApplyFieldName, number | null>> & {
  studentUid: string;
};

type JobApplication = { status: string; appliedAt: string | null } | null;

type StudentVideoJob = {
  uid: string;
  jobKind: "student_detail_video_v1";
  status: string;
  progress: { completed: number; failed: number; total: number };
  video: {
    inputUid: string;
    filename: string;
    status: string;
    evidenceAvailableUntil: string | null;
  } | null;
  result: StudentDetailVideoResult | null;
  currentStudentStates?: Record<string, CurrentStudentState>;
  studentCatalog?: Record<string, { uid: string; name: string }>;
  application: JobApplication;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type JobSummary = Pick<
  StudentVideoJob,
  "uid" | "jobKind" | "status" | "progress" | "application" | "createdAt" | "updatedAt" | "expiresAt"
>;

type ReviewStudent = {
  included: boolean;
  confirmed: Record<ApplyFieldName, boolean>;
  values: Record<ApplyFieldName, string>;
};

export type ReviewState = Record<string, ReviewStudent>;

export default function StudentScanner() {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<StudentVideoJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<JobSummary[]>([]);
  const [review, setReview] = useState<ReviewState>({});
  const [phase, setPhase] = useState<"idle" | "uploading" | "waiting" | "review" | "applying" | "applied">("idle");
  const [hashProgress, setHashProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const showJob = useCallback((next: StudentVideoJob) => {
    setJob(next);
    if (next.status === "review_ready" && next.result) {
      setReview(createReviewState(next.result));
      setPhase(next.application?.status === "applied" ? "applied" : "review");
      setError(null);
    } else if (["queued", "processing"].includes(next.status)) {
      setPhase("waiting");
      setError(null);
    } else if (next.status === "failed") {
      setPhase("idle");
      setError("영상을 인식하지 못했어요. 녹화 안내를 확인한 뒤 다시 시도해 주세요.");
    }
  }, []);

  useEffect(() => {
    requestJson<{ jobs: JobSummary[] }>("/api/ocr/jobs?jobKind=student_detail_video_v1")
      .then(({ jobs }) => setRecentJobs(jobs))
      .catch((loadError) => setError(toErrorMessage(loadError)));
  }, []);

  useEffect(() => {
    if (phase !== "waiting" || !job) return;
    const timeout = window.setTimeout(() => {
      requestJson<StudentVideoJob>(`/api/ocr/jobs/${job.uid}`)
        .then(showJob)
        .catch((pollError) => setError(toErrorMessage(pollError)));
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [job, phase, showJob]);

  const selectedStudentCount = useMemo(() => Object.values(review).filter(({ included }) => included).length, [review]);

  async function startRecognition() {
    if (!file) return;
    setError(null);
    setSuccess(null);
    setPhase("uploading");
    try {
      const sha256 = await sha256File(file, (processed) => setHashProgress(processed / file.size));
      const created = await requestJson<{
        jobUid: string;
        video: { uploadUrl: string };
      }>("/api/ocr/jobs", {
        method: "POST",
        body: JSON.stringify({
          jobKind: "student_detail_video_v1",
          video: {
            filename: file.name,
            contentType: "video/mp4",
            byteSize: file.size,
            sha256,
          },
          trainingConsent: false,
        }),
      });
      const uploaded = await fetch(created.video.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: file,
      });
      if (!uploaded.ok) throw new Error("영상 업로드에 실패했어요");
      const submitted = await requestJson<StudentVideoJob>(`/api/ocr/jobs/${created.jobUid}/submit`, {
        method: "POST",
      });
      showJob(submitted);
      setRecentJobs((current) => upsertJobSummary(current, submitted));
    } catch (uploadError) {
      setPhase("idle");
      setError(toErrorMessage(uploadError));
    }
  }

  async function openJob(jobUid: string) {
    setError(null);
    try {
      showJob(await requestJson<StudentVideoJob>(`/api/ocr/jobs/${jobUid}`));
    } catch (loadError) {
      setError(toErrorMessage(loadError));
    }
  }

  async function applyReview() {
    if (!job?.result) return;
    const { students } = buildStudentVideoApplyRequest(job.result, review);
    if (students.length === 0) {
      setError("반영할 학생을 한 명 이상 선택해 주세요.");
      return;
    }

    setPhase("applying");
    setError(null);
    try {
      const response = await requestJson<{ application: NonNullable<JobApplication> }>(
        `/api/ocr/jobs/${job.uid}/apply`,
        { method: "POST", body: JSON.stringify({ students }) },
      );
      setJob({ ...job, application: response.application });
      setRecentJobs((current) =>
        current.map((recent) => (recent.uid === job.uid ? { ...recent, application: response.application } : recent)),
      );
      setPhase("applied");
      setSuccess(`${students.length}명의 선택한 성장도를 반영했어요.`);
    } catch (applyError) {
      setPhase("review");
      setError(toErrorMessage(applyError));
    }
  }

  function selectFile(next: File | null) {
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".mp4") || (next.type && next.type !== "video/mp4")) {
      setError("MP4 영상 한 개만 선택할 수 있어요.");
      return;
    }
    if (next.size <= 0 || next.size > OCR_MAX_VIDEO_BYTES) {
      setError("영상은 512MB를 넘을 수 없어요.");
      return;
    }
    setFile(next);
    setHashProgress(0);
    setError(null);
    setSuccess(null);
  }

  function seekEvidence(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    void video.play();
  }

  return (
    <div className="space-y-8 pb-12 pt-6 lg:pt-2">
      {error ? <Callout tone="destructive">{error}</Callout> : null}
      {success ? <Callout tone="success" Icon={CheckCircleIcon} description={success} /> : null}

      <section>
        <SubTitle
          text="학생부 녹화 영상 업로드"
          description="학생의 기본 정보 화면을 안정적으로 보여 준 뒤 다음 학생으로 넘긴 MP4를 첨부해 주세요"
        />
        <div className="space-y-5 rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
          <Callout
            tone="info"
            title="녹화 안내"
            description="학생 순서와 필터는 자유입니다. 알림·화면 분할·편집 전환 효과를 피하고 가능하면 720p 이상으로 녹화해 주세요."
          />
          <div className="focus-within:rounded-lg focus-within:ring-2 focus-within:ring-ring/30">
            <input
              id="student-scanner-video"
              type="file"
              accept="video/mp4,.mp4"
              className="sr-only"
              disabled={phase !== "idle"}
              onChange={(event) => {
                selectFile(event.currentTarget.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
            <label
              htmlFor="student-scanner-video"
              className={cn(
                "flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 px-5 py-8 text-center transition-colors hover:border-primary/60 hover:bg-muted/40",
                phase !== "idle" && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FilmIcon className="size-6" aria-hidden="true" />
              </span>
              <span className="mt-3 font-medium text-foreground">{file ? file.name : "MP4 영상을 선택하세요"}</span>
              <span className="mt-1 text-sm text-muted-foreground">MP4 한 개 · 최대 512MB · 최대 10분 · 최대 4K</span>
              {file ? (
                <span className="mt-2 text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                  {phase === "uploading" ? ` · 무결성 계산 ${Math.round(hashProgress * 100)}%` : ""}
                </span>
              ) : null}
            </label>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" disabled={!file || phase !== "idle"} onClick={startRecognition}>
              {phase === "uploading" ? "업로드 준비 중..." : "영상 인식 시작"}
            </Button>
          </div>
        </div>
      </section>

      {phase === "waiting" && job ? (
        <SectionCard title="영상을 인식하고 있어요" description="페이지를 닫아도 작업은 계속됩니다.">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ArrowPathIcon className="size-5 animate-spin" aria-hidden="true" />
            <span>{job.status === "queued" ? "처리 순서를 기다리는 중" : "학생 화면을 분할하고 성장도를 읽는 중"}</span>
          </div>
        </SectionCard>
      ) : null}

      {job?.status === "review_ready" && job.result ? (
        <ReviewPanel
          job={{ ...job, result: job.result }}
          review={review}
          phase={phase}
          selectedStudentCount={selectedStudentCount}
          videoRef={videoRef}
          onReviewChange={setReview}
          onSeek={seekEvidence}
          onApply={applyReview}
        />
      ) : null}

      {recentJobs.length > 0 ? (
        <SectionCard title="최근 영상 인식 작업">
          <div className="divide-y divide-border">
            {recentJobs.map((recent) => (
              <button
                key={recent.uid}
                type="button"
                className="flex w-full items-center justify-between gap-4 py-3 text-left first:pt-0 last:pb-0"
                onClick={() => openJob(recent.uid)}
              >
                <span>
                  <span className="block text-sm font-medium">{formatJobDate(recent.createdAt)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {statusLabel(recent.status)} · 완료 {recent.progress.completed}/{recent.progress.total}
                  </span>
                </span>
                <PlayIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function ReviewPanel({
  job,
  review,
  phase,
  selectedStudentCount,
  videoRef,
  onReviewChange,
  onSeek,
  onApply,
}: {
  job: StudentVideoJob & { result: StudentDetailVideoResult };
  review: ReviewState;
  phase: string;
  selectedStudentCount: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onReviewChange: React.Dispatch<React.SetStateAction<ReviewState>>;
  onSeek: (seconds: number) => void;
  onApply: () => void;
}) {
  const unresolvedStudents = job.result.students.filter(({ studentUid }) => !job.studentCatalog?.[studentUid]);
  return (
    <section className="space-y-4">
      <SubTitle
        text="인식 결과 검토"
        description={`${job.result.students.length}명 인식 · 미해결 필드 ${job.result.unresolvedCount}개`}
      />
      {job.video?.evidenceAvailableUntil ? (
        <SectionCard
          title="근거 영상"
          description="학생의 근거 시점을 누르면 이 영상의 해당 위치로 이동합니다."
          action={
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ClockIcon className="size-4" />
              {formatEvidenceExpiry(job.video.evidenceAvailableUntil)}까지
            </span>
          }
        >
          {/* biome-ignore lint/a11y/useMediaCaption: Student detail screen recordings do not contain required spoken content. */}
          <video ref={videoRef} controls preload="metadata" className="max-h-96 w-full rounded-md bg-black">
            <source src={`/api/ocr/jobs/${job.uid}/video`} type="video/mp4" />
          </video>
        </SectionCard>
      ) : (
        <Callout tone="warning">원본 영상 보존 시간이 지나 근거 시점 재생은 사용할 수 없어요.</Callout>
      )}

      {unresolvedStudents.length > 0 ? (
        <Callout
          tone="warning"
          title="학생 식별 필요"
          description={`${unresolvedStudents.length}개 결과는 현재 카탈로그의 UID와 확인되지 않아 임의 학생에게 연결하지 않았어요.`}
        />
      ) : null}

      <div className="space-y-3">
        {job.result.students.map((student) => {
          const state = review[student.studentUid];
          const catalogStudent = job.studentCatalog?.[student.studentUid];
          if (!state) return null;
          const tierRecognized = student.fieldDetails.tier.state === "recognized";
          const canInclude = Boolean(catalogStudent && tierRecognized && phase !== "applied");
          return (
            <SectionCard
              key={student.studentUid}
              title={catalogStudent?.name ?? student.studentName}
              description={`UID ${student.studentUid} · 이름 신뢰도 ${formatConfidence(student.nameConfidence)}`}
              action={
                <div className="flex items-center gap-3">
                  {student.sourceTimestampsSeconds[0] != null && job.video?.evidenceAvailableUntil ? (
                    <Button size="xs" onClick={() => onSeek(student.sourceTimestampsSeconds[0])}>
                      {formatTimestamp(student.sourceTimestampsSeconds[0])}
                    </Button>
                  ) : null}
                  <Checkbox
                    label="학생 반영"
                    checked={state.included}
                    disabled={!canInclude}
                    onChange={(included) =>
                      onReviewChange((current) => ({
                        ...current,
                        [student.studentUid]: { ...current[student.studentUid], included },
                      }))
                    }
                  />
                </div>
              }
            >
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {fields.map((field) => {
                  const detail = student.fieldDetails[field.resultKey];
                  const currentValue = job.currentStudentStates?.[student.studentUid]?.[field.applyKey] ?? null;
                  const recognized = detail.state === "recognized";
                  const confirmed = state.confirmed[field.applyKey];
                  const edited = recognized && state.values[field.applyKey] !== String(detail.value);
                  return (
                    <div
                      key={field.resultKey}
                      className={cn(
                        "rounded-md bg-muted/40 p-3",
                        recognized && currentValue !== detail.value && "bg-primary/5",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{field.label}</p>
                          <p className="text-xs text-muted-foreground">
                            현재 {currentValue ?? "—"} · {fieldStateLabel(detail.state)}
                            {recognized ? ` ${formatConfidence(detail.confidence)}` : ""}
                            {edited ? " · 직접 수정" : ""}
                          </p>
                        </div>
                        <Checkbox
                          aria-label={`${field.label} 승인`}
                          checked={confirmed}
                          disabled={!state.included || !recognized || phase === "applied" || field.applyKey === "tier"}
                          onChange={(checked) =>
                            onReviewChange((current) => ({
                              ...current,
                              [student.studentUid]: {
                                ...current[student.studentUid],
                                confirmed: {
                                  ...current[student.studentUid].confirmed,
                                  [field.applyKey]: checked,
                                },
                              },
                            }))
                          }
                        />
                      </div>
                      {recognized ? (
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          value={state.values[field.applyKey]}
                          disabled={!state.included || phase === "applied"}
                          aria-label={`${field.label} 인식값`}
                          className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
                          onChange={(event) =>
                            onReviewChange((current) => ({
                              ...current,
                              [student.studentUid]: {
                                ...current[student.studentUid],
                                values: {
                                  ...current[student.studentUid].values,
                                  [field.applyKey]: event.currentTarget.value,
                                },
                              },
                            }))
                          }
                        />
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {detail.state === "not_applicable"
                            ? "미장착·잠금으로 인식됨 · 기존 값 유지"
                            : "판독하지 못해 기존 값을 유지합니다."}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          );
        })}
      </div>
      <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-lg bg-popover p-4 shadow-lg">
        <p className="text-sm text-muted-foreground">{selectedStudentCount}명 선택</p>
        <Button
          variant="primary"
          disabled={selectedStudentCount === 0 || phase === "applying" || phase === "applied"}
          onClick={onApply}
        >
          {phase === "applying" ? "반영 중..." : phase === "applied" ? "반영 완료" : "선택한 성장도 반영"}
        </Button>
      </div>
    </section>
  );
}

export function createReviewState(result: StudentDetailVideoResult): ReviewState {
  return Object.fromEntries(
    result.students.map((student) => [
      student.studentUid,
      {
        included: false,
        confirmed: Object.fromEntries(
          fields.map(({ resultKey, applyKey }) => [applyKey, student.fieldDetails[resultKey].state === "recognized"]),
        ),
        values: Object.fromEntries(
          fields.map(({ resultKey, applyKey }) => [
            applyKey,
            student.fieldDetails[resultKey].state === "recognized" ? String(student.fieldDetails[resultKey].value) : "",
          ]),
        ),
      },
    ]),
  ) as ReviewState;
}

export function buildStudentVideoApplyRequest(
  result: StudentDetailVideoResult,
  review: ReviewState,
): {
  students: Array<{
    studentUid: string;
    current: Partial<Record<ApplyFieldName, number>>;
    confirmedFields: ApplyFieldName[];
  }>;
} {
  return {
    students: result.students.flatMap((student) => {
      const state = review[student.studentUid];
      if (!state?.included) return [];
      const confirmedFields = fields.flatMap(({ applyKey }) => (state.confirmed[applyKey] ? [applyKey] : []));
      const current = Object.fromEntries(
        confirmedFields.map((field) => {
          const value = Number(state.values[field]);
          if (!Number.isInteger(value)) throw new Error("승인한 필드의 값을 확인해 주세요.");
          return [field, value];
        }),
      ) as Partial<Record<ApplyFieldName, number>>;
      return [{ studentUid: student.studentUid, current, confirmedFields }];
    }),
  };
}

function fieldStateLabel(state: StudentVideoFieldState): string {
  return {
    recognized: "인식값",
    not_applicable: "미장착·잠금",
    unknown: "인식 실패",
    conflict: "프레임 간 충돌",
  }[state];
}

function statusLabel(status: string): string {
  return (
    {
      queued: "대기 중",
      processing: "인식 중",
      review_ready: "검토 가능",
      failed: "실패",
    }[status] ?? status
  );
}

function upsertJobSummary(current: JobSummary[], job: StudentVideoJob): JobSummary[] {
  return [job, ...current.filter(({ uid }) => uid !== job.uid)].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as ({ error?: string } & T) | null;
  if (!response.ok) throw new Error(body?.error ?? "요청을 처리하지 못했어요");
  return body as T;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했어요";
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, "0")} 근거`;
}

function formatEvidenceExpiry(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatJobDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
