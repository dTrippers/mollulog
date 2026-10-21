import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { type Dispatch, type ReactNode, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { ScannerCompletionSummary } from "~/components/v2/features/scanner/ScannerCompletionSummary";
import { ScannerEndBlock } from "~/components/v2/features/scanner/ScannerEndBlock";
import {
  type ScannerFileStatusItem,
  ScannerFileStatusList,
} from "~/components/v2/features/scanner/ScannerFileStatusList";
import { ScannerJobStatusNotice } from "~/components/v2/features/scanner/ScannerJobStatusNotice";
import { formatScannerQuotaAvailability } from "~/components/v2/features/scanner/ScannerQuota";
import {
  ScannerStepHeader,
  type ScannerStepStates,
  ScannerStepTitle,
} from "~/components/v2/features/scanner/ScannerStepHeader";
import { scannerNumberInputClassName } from "~/components/v2/features/scanner/scanner-number-input";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import { TierInput } from "~/components/v2/features/students/TierInput";
import { PageActionBar } from "~/components/v2/layout/PageActionBar";
import { Button } from "~/components/v2/primitives/Button";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { Popover } from "~/components/v2/primitives/Popover";
import { ProgressBar } from "~/components/v2/primitives/ProgressBar";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { Switch } from "~/components/v2/primitives/Switch";
import {
  type NumberInputFlowNavigationInputProps,
  useNumberInputFlowNavigation,
} from "~/components/v2/primitives/use-number-input-flow-navigation";
import type { FavoriteLabelState } from "~/domain/futures/futures-view-model";
import { EQUIPMENT_TYPE_LABELS } from "~/domain/growth-resource";
import type { OcrUploadInput, OcrVideoUploadInput } from "~/domain/ocr";
import {
  STUDENT_IMAGE_DIMENSIONS_EXCEEDED_CODE,
  STUDENT_IMAGE_DIMENSIONS_EXCEEDED_MESSAGE,
  type StudentDetailImageStudent,
  type StudentDetailImagesResult,
} from "~/domain/student-image-ocr";
import type {
  StudentDetailVideoResult,
  StudentVideoFieldName,
  StudentVideoFieldState,
} from "~/domain/student-video-ocr";
import { cn } from "~/lib/utils";
import { formatVisibleName } from "~/models/student";
import type { ScannerOutletContext } from "../scanner";
import ScannerFileList from "../scanner._components/ScannerFileList";
import ScannerImageDialog from "../scanner._components/ScannerImageDialog";
import ScannerJobSkeleton from "../scanner._components/ScannerJobSkeleton";
import { notifyScannerJobsChanged } from "../scanner._components/ScannerJobsPanel";
import ScannerUploadSection from "../scanner._components/ScannerUploadSection";
import ScannerUploadTargetGuide from "../scanner._components/ScannerUploadTargetGuide";
import {
  formatScannerBytes,
  requestScannerJson,
  ScannerApiRequestError,
  type ScannerPhase,
  toScannerErrorMessage,
  uploadScannerFile,
} from "../scanner._components/scanner-client";
import {
  formatScannerRelativeTime,
  getScannerCompletionState,
  getScannerJobStatusView,
  getScannerTerminalJobDescription,
  getScannerTerminalJobTitle,
  getScannerUnavailableResultMessage,
  scannerMessages,
} from "../scanner._components/scanner-messages";
import { getScannerStepBody } from "../scanner._components/scanner-step-body";
import {
  getScannerImageContentType,
  getScannerVideoContentType,
  mergeScannerFiles,
  type ScannerUploadSelection,
  STUDENT_SCANNER_ACCEPT_SPEC,
  scannerFileKey,
  validateScannerFiles,
} from "../scanner._components/scanner-upload";
import { sha256FileInWorker } from "../scanner._components/sha256-client";
import type { ScannerUploadQuota } from "../scanner._components/UploadQuotaMeter";
import { useScannerJob } from "../scanner._components/useScannerJob";

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

const tierField = { resultKey: "tier", applyKey: "tier", label: "성급", min: 1, max: 9 } as const;
const levelField = { resultKey: "level", applyKey: "level", label: "학생 Lv", min: 1, max: 90 } as const;
const weaponLevelField = {
  resultKey: "weaponLevel",
  applyKey: "weaponLevel",
  label: "고유무기",
  min: 0,
  max: 60,
} as const;
const abilityHpField = { resultKey: "abilityHp", applyKey: "abilityHp", label: "체력", min: 0, max: 25 } as const;
const abilityAtkField = {
  resultKey: "abilityAtk",
  applyKey: "abilityAtk",
  label: "공격력",
  min: 0,
  max: 25,
} as const;
const abilityHealField = {
  resultKey: "abilityHeal",
  applyKey: "abilityHeal",
  label: "치유력",
  min: 0,
  max: 25,
} as const;
const skillExField = { resultKey: "skillEx", applyKey: "skillEx", label: "EX", min: 1, max: 5 } as const;
const skillNormalField = {
  resultKey: "skillNormal",
  applyKey: "skillNormal",
  label: "기본",
  min: 1,
  max: 10,
} as const;
const skillEnhancedField = {
  resultKey: "skillEnhanced",
  applyKey: "skillEnhanced",
  label: "강화",
  min: 1,
  max: 10,
} as const;
const skillSubField = {
  resultKey: "skillSub",
  applyKey: "skillSub",
  label: "서브",
  min: 1,
  max: 10,
} as const;
const equip1Field = { resultKey: "equip1", applyKey: "equip1", label: "1슬롯", min: 1, max: 10 } as const;
const equip2Field = { resultKey: "equip2", applyKey: "equip2", label: "2슬롯", min: 1, max: 10 } as const;
const equip3Field = { resultKey: "equip3", applyKey: "equip3", label: "3슬롯", min: 1, max: 10 } as const;
const equipSpecialField = {
  resultKey: "equipSpecial",
  applyKey: "equipSpecial",
  label: "애용품",
  min: 1,
  max: 2,
} as const;
const relationshipRankField = {
  resultKey: "relationshipRank",
  applyKey: "bond",
  label: "인연",
  min: 1,
  max: 100,
} as const;

const basicNumberFields = [levelField, weaponLevelField, relationshipRankField] as const;
const skillFields = [skillExField, skillNormalField, skillEnhancedField, skillSubField] as const;
const equipmentFields = [equip1Field, equip2Field, equip3Field, equipSpecialField] as const;
const abilityFields = [abilityHpField, abilityAtkField, abilityHealField] as const;

const fields: readonly FieldDefinition[] = [
  tierField,
  levelField,
  weaponLevelField,
  abilityHpField,
  abilityAtkField,
  abilityHealField,
  skillExField,
  skillNormalField,
  skillEnhancedField,
  skillSubField,
  equip1Field,
  equip2Field,
  equip3Field,
  equipSpecialField,
  relationshipRankField,
] as const;

const LOW_ACCURACY_THRESHOLD = 0.8;
const TERMINAL_JOB_STATUSES = new Set(["failed", "cancelled", "expired"]);

type CurrentStudentState = Partial<Record<ApplyFieldName, number | null>> & {
  studentUid: string;
};

type JobApplication = { status: string; appliedAt: string | null } | null;

type StudentGrowthResult = StudentDetailVideoResult | StudentDetailImagesResult;
type StudentGrowthStudent = StudentDetailVideoResult["students"][number] | StudentDetailImageStudent;
type StudentFieldDetail = StudentGrowthStudent["fieldDetails"][StudentVideoFieldName];

export type StudentCompletionSummary = {
  appliedCount: number;
  excludedCount: number;
  applied: Array<{ uid: string; name: string | null }>;
  excluded: Array<{ uid: string; name: string | null }>;
};

type StudentVideoJob = {
  completionSummary?: StudentCompletionSummary | null;
  uid: string;
  jobKind: "student_detail_video_v1" | "student_detail_images_v1";
  status: string;
  progress: { completed: number; failed: number; total: number };
  images: Array<{ uid: string; filename: string; status: string; error: { code: string; message: string } | null }>;
  video: {
    inputUid: string;
    filename: string;
    contentType: string;
    status: string;
    evidenceAvailableUntil: string | null;
  } | null;
  result: StudentGrowthResult | null;
  // The stored result could not be read. The job is kept, with no retry: the unavailable state is the outcome.
  resultInvalid?: boolean;
  artifacts: Array<{
    uid: string;
    studentUid: string;
    sourceFrame: number;
    timestampSeconds: number;
  }>;
  currentStudentStates?: Record<string, CurrentStudentState>;
  studentCatalog?: Record<string, { uid: string; name: string; initialTier: number; equipments: string[] }>;
  application: JobApplication;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type StudentImageFailure = StudentVideoJob["images"][number];

type StudentUploadFailure = {
  kind: "images" | "video";
  error?: unknown;
};

export type StudentUploadPartialFailure = {
  jobUid: string;
  message: string;
};

type ReviewStudent = {
  confirmed: Record<ApplyFieldName, boolean>;
  values: Record<ApplyFieldName, string>;
};

export type ReviewState = Record<string, ReviewStudent>;
type PendingFocusTarget = { kind: "student"; studentUid: string } | { kind: "action-bar" };
type FieldComparison = "same" | "decreased" | null;

const STUDENT_UPLOAD_HASH_ERROR = "파일 정보를 계산하지 못했어요";
const STUDENT_UPLOAD_UPLOAD_ERROR = "파일 업로드에 실패했어요. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
const STUDENT_UPLOAD_GENERIC_FAILURE_REASON = "파일 제출을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";

export type StudentUploadSelection = ScannerUploadSelection;

export function getStudentUploadQuotaError(
  selection: StudentUploadSelection,
  imageQuota: ScannerUploadQuota | null,
  videoQuota: ScannerUploadQuota | null,
): string | null {
  const errors: string[] = [];
  if (selection.images.length > 0) {
    if (!imageQuota) {
      errors.push("이미지 업로드 가능 수를 확인하는 중이에요.");
    } else if (selection.images.length > imageQuota.remaining) {
      errors.push(`이미지 업로드 가능 수가 부족해요. 최근 7일 동안 ${imageQuota.remaining}장만 더 업로드할 수 있어요.`);
    }
  }
  if (selection.video) {
    if (!videoQuota) {
      errors.push("영상 업로드 가능 수를 확인하는 중이에요.");
    } else if (videoQuota.remaining < 1) {
      errors.push("최근 7일 동안 업로드할 수 있는 영상 수를 모두 사용했어요.");
    }
  }
  return errors.length > 0 ? `${errors.join(" ")} 잠시 후 다시 시도해 주세요.` : null;
}

export function getStudentUploadPartialFailureMessage(failures: ReadonlyArray<StudentUploadFailure>): string {
  const failedKinds = failures.map(({ kind, error }) => {
    const label = kind === "images" ? "이미지" : "영상";
    return error === undefined ? label : `${label}(${getStudentUploadFailureReason(error)})`;
  });
  return `${failedKinds.join(" 및 ")} 제출에 실패했어요. 성공한 인식 작업은 계속 진행되고 최근 작업에서 확인할 수 있어요.`;
}

export function getStudentUploadFailureReason(error: unknown): string {
  if (error instanceof ScannerApiRequestError && error.message) return error.message;
  if (error instanceof Error && [STUDENT_UPLOAD_HASH_ERROR, STUDENT_UPLOAD_UPLOAD_ERROR].includes(error.message)) {
    return error.message;
  }
  return STUDENT_UPLOAD_GENERIC_FAILURE_REASON;
}

export function getStudentUploadPartialFailureForJob(
  partialFailure: StudentUploadPartialFailure | null,
  selectedJobUid: string | null,
): string | null {
  return partialFailure?.jobUid === selectedJobUid ? partialFailure.message : null;
}

type StudentUploadBranchFailure = StudentUploadFailure & { error: unknown };

export type StudentUploadSubmissionOptions = {
  hashFile?: typeof sha256FileInWorker;
  requestJson?: typeof requestScannerJson;
  uploadFile?: typeof uploadScannerFile;
  onHashProgress?: (progress: number) => void;
  onUploadProgress?: (progress: number) => void;
  onImageQuota?: (quota: ScannerUploadQuota) => void;
  onVideoQuota?: (quota: ScannerUploadQuota) => void;
};

export type StudentUploadSubmissionResult = {
  successfulJobs: StudentVideoJob[];
  failures: StudentUploadBranchFailure[];
};

export async function submitStudentUploadSelection(
  selection: StudentUploadSelection,
  allowsTrainingDataUse: boolean,
  options: StudentUploadSubmissionOptions = {},
): Promise<StudentUploadSubmissionResult> {
  const hashFile = options.hashFile ?? sha256FileInWorker;
  const requestJson = options.requestJson ?? requestScannerJson;
  const uploadFile = options.uploadFile ?? uploadScannerFile;
  const selectedFiles = [...selection.images, ...(selection.video ? [selection.video] : [])];
  const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  let uploadedBytes = 0;
  const hashedBytesByFile = new Map<string, number>();
  const hashBranchCount = Number(selection.images.length > 0) + Number(selection.video !== null);
  let completedHashBranches = 0;

  const reportHashProgress = (key: string, file: File, processedBytes: number) => {
    const previous = hashedBytesByFile.get(key) ?? 0;
    const next = Math.min(file.size, Math.max(previous, processedBytes));
    hashedBytesByFile.set(key, next);
    const hashedBytes = Array.from(hashedBytesByFile.values()).reduce((sum, value) => sum + value, 0);
    options.onHashProgress?.(totalBytes === 0 ? 1 : Math.min(1, hashedBytes / totalBytes));
  };

  const markHashBranchComplete = () => {
    completedHashBranches += 1;
    if (completedHashBranches === hashBranchCount) options.onHashProgress?.(1);
  };

  const prepareFiles = async (kind: "image" | "video", files: File[]) => {
    try {
      const preparedFiles: Array<{
        file: File;
        contentType: OcrUploadInput["contentType"] | OcrVideoUploadInput["contentType"];
        sha256: string;
      }> = [];
      for (const file of files) {
        const contentType = kind === "image" ? getScannerImageContentType(file) : getScannerVideoContentType(file);
        if (!contentType) throw new Error("지원하는 파일은 PNG, JPEG, WebP 이미지와 MP4, MOV 영상이에요.");
        const key = `${kind}:${scannerFileKey(file)}`;
        try {
          const sha256 = await hashFile(file, (processed) => reportHashProgress(key, file, processed));
          reportHashProgress(key, file, file.size);
          preparedFiles.push({ file, contentType, sha256 });
        } catch (error) {
          reportHashProgress(key, file, file.size);
          throw error;
        }
      }
      return preparedFiles;
    } finally {
      markHashBranchComplete();
    }
  };

  const uploadFileWithProgress = async (url: string, file: File, contentType: string) => {
    let previousUploadedBytes = 0;
    await uploadFile({
      url,
      file,
      contentType,
      onProgress: (uploaded) => {
        const delta = Math.max(0, uploaded - previousUploadedBytes);
        previousUploadedBytes = Math.max(previousUploadedBytes, uploaded);
        uploadedBytes += delta;
        options.onUploadProgress?.(Math.min(1, uploadedBytes / Math.max(1, totalBytes)));
      },
    });
  };

  const submissions: Array<{ kind: StudentUploadFailure["kind"]; promise: Promise<StudentVideoJob> }> = [];

  if (selection.images.length > 0) {
    submissions.push({
      kind: "images",
      promise: (async () => {
        const imageFiles = await prepareFiles("image", selection.images);
        const inputs: OcrUploadInput[] = imageFiles.map(({ file, contentType, sha256 }) => ({
          filename: file.name,
          contentType: contentType as OcrUploadInput["contentType"],
          byteSize: file.size,
          sha256,
        }));
        const created = await requestJson<{
          jobUid: string;
          quota: ScannerUploadQuota;
          images: Array<{ imageUid: string; filename: string; uploadUrl: string }>;
        }>("/api/ocr/jobs", {
          method: "POST",
          body: JSON.stringify({
            jobKind: "student_detail_images_v1",
            images: inputs,
            trainingConsent: allowsTrainingDataUse,
          }),
        });
        options.onImageQuota?.(created.quota);
        for (const [index, { file, contentType }] of imageFiles.entries()) {
          await uploadFileWithProgress(created.images[index].uploadUrl, file, contentType);
        }
        return requestJson<StudentVideoJob>(`/api/ocr/jobs/${created.jobUid}/submit`, {
          method: "POST",
        });
      })(),
    });
  }

  if (selection.video) {
    submissions.push({
      kind: "video",
      promise: (async () => {
        const [videoFile] = await prepareFiles("video", [selection.video as File]);
        const created = await requestJson<{
          jobUid: string;
          quota: ScannerUploadQuota;
          video: { uploadUrl: string };
        }>("/api/ocr/jobs", {
          method: "POST",
          body: JSON.stringify({
            jobKind: "student_detail_video_v1",
            video: {
              filename: videoFile.file.name,
              contentType: videoFile.contentType as OcrVideoUploadInput["contentType"],
              byteSize: videoFile.file.size,
              sha256: videoFile.sha256,
            },
            trainingConsent: allowsTrainingDataUse,
          }),
        });
        options.onVideoQuota?.(created.quota);
        await uploadFileWithProgress(created.video.uploadUrl, videoFile.file, videoFile.contentType);
        return requestJson<StudentVideoJob>(`/api/ocr/jobs/${created.jobUid}/submit`, {
          method: "POST",
        });
      })(),
    });
  }

  const settled = await Promise.allSettled(submissions.map(({ promise }) => promise));
  const successfulJobs = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const failures = settled.flatMap((result, index) =>
    result.status === "rejected" ? [{ kind: submissions[index].kind, error: result.reason }] : [],
  );
  return { successfulJobs, failures };
}

export function getStudentFailedImagesDescription(images: ReadonlyArray<StudentImageFailure>): string {
  const failedImages = images.filter((image) => image.status === "failed");
  const oversizedImages = failedImages.filter((image) => image.error?.code === STUDENT_IMAGE_DIMENSIONS_EXCEEDED_CODE);
  if (oversizedImages.length === 0) {
    return failedImages.map((image) => image.filename).join(", ");
  }

  const descriptions = [
    `${oversizedImages.map((image) => image.filename).join(", ")} · ${STUDENT_IMAGE_DIMENSIONS_EXCEEDED_MESSAGE}`,
  ];
  const otherFailedImages = failedImages.filter(
    (image) => image.error?.code !== STUDENT_IMAGE_DIMENSIONS_EXCEEDED_CODE,
  );
  if (otherFailedImages.length > 0) {
    descriptions.push(otherFailedImages.map((image) => image.filename).join(", "));
  }
  return descriptions.join(" · ");
}

export function getStudentJobTransition(job: Pick<StudentVideoJob, "status" | "result" | "application">): {
  phase: ScannerPhase;
  error?: string | null;
} {
  if (job.status === "review_ready") {
    if (!job.result) return { phase: "idle", error: getScannerUnavailableResultMessage() };
    return { phase: job.application?.status === "applied" ? "applied" : "review" };
  }
  if (["queued", "processing", "finalizing"].includes(job.status)) return { phase: "waiting" };
  if (TERMINAL_JOB_STATUSES.has(job.status)) return { phase: "idle" };
  return { phase: "idle", error: getScannerUnavailableResultMessage() };
}

export function selectLatestStudentJob<T extends Pick<StudentVideoJob, "createdAt" | "jobKind">>(
  jobs: ReadonlyArray<T>,
): T | null {
  return jobs.reduce<T | null>((latest, candidate) => {
    if (!latest) return candidate;
    const latestCreatedAt = new Date(latest.createdAt).getTime();
    const candidateCreatedAt = new Date(candidate.createdAt).getTime();
    if (candidateCreatedAt > latestCreatedAt) return candidate;
    if (candidateCreatedAt < latestCreatedAt) return latest;
    return candidate.jobKind === "student_detail_video_v1" ? candidate : latest;
  }, null);
}

export default function StudentScanner() {
  const {
    videoUploadQuota: uploadQuota,
    setVideoUploadQuota: setUploadQuota,
    imageUploadQuota,
    setImageUploadQuota,
    openJobsPanel,
    setMobileActionBarHidden,
    stacked,
  } = useOutletContext<ScannerOutletContext>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [allowsTrainingDataUse, setAllowsTrainingDataUse] = useState(false);
  const [partialFailure, setPartialFailure] = useState<StudentUploadPartialFailure | null>(null);
  const [review, setReview] = useState<ReviewState>({});
  const [excludedStudentUids, setExcludedStudentUids] = useState<Set<string>>(() => new Set());
  const [hashProgress, setHashProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const handleJob = useCallback((next: StudentVideoJob) => {
    if (next.status === "review_ready" && next.result) {
      setReview(next.application?.status === "applied" ? {} : createReviewState(next.result));
      setExcludedStudentUids(new Set());
      return;
    }
    setReview({});
    setExcludedStudentUids(new Set());
  }, []);

  const handleReset = useCallback(() => {
    setSelectedFiles([]);
    setReview({});
    setExcludedStudentUids(new Set());
    setHashProgress(0);
    setUploadProgress(0);
    setAllowsTrainingDataUse(false);
    setPartialFailure(null);
  }, []);

  const lifecycle = useScannerJob<StudentVideoJob>({
    getTransition: getStudentJobTransition,
    onJob: handleJob,
    onReset: handleReset,
  });
  const {
    job,
    phase,
    setPhase,
    error,
    setError,
    isCancelling,
    selectedJobUid,
    setSearchParams,
    acceptJob,
    updateJob,
    resetForNewUpload,
    refreshJob,
    beginNewUpload,
    statusError,
    cancelResult,
  } = lifecycle;

  async function startRecognition() {
    const selection = validateScannerFiles(selectedFiles, STUDENT_SCANNER_ACCEPT_SPEC);
    if (selection.error) {
      setError(selection.error);
      return;
    }
    if (selectedFiles.length === 0) return;

    const quotaError = getStudentUploadQuotaError(selection, imageUploadQuota, uploadQuota);
    if (quotaError) {
      setError(quotaError);
      return;
    }

    beginNewUpload();
    setError(null);
    setPartialFailure(null);
    setPhase("uploading");
    setHashProgress(0);
    setUploadProgress(0);

    try {
      const { successfulJobs, failures } = await submitStudentUploadSelection(selection, allowsTrainingDataUse, {
        onHashProgress: setHashProgress,
        onUploadProgress: setUploadProgress,
        onImageQuota: setImageUploadQuota,
        onVideoQuota: setUploadQuota,
      });

      for (const failure of failures) {
        if (!(failure.error instanceof ScannerApiRequestError) || !failure.error.quota) continue;
        if (failure.kind === "images") setImageUploadQuota(failure.error.quota);
        else setUploadQuota(failure.error.quota);
      }

      if (successfulJobs.length === 0) {
        setPhase("idle");
        setError(
          failures
            .map(
              ({ kind, error }) => `${kind === "images" ? "이미지" : "영상"}: ${getStudentUploadFailureReason(error)}`,
            )
            .join(" "),
        );
        return;
      }

      const selectedJob = selectLatestStudentJob(successfulJobs);
      if (!selectedJob) {
        setPhase("idle");
        setError("인식 작업을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      acceptJob(selectedJob);
      setSearchParams({ job: selectedJob.uid }, { replace: true });
      setAllowsTrainingDataUse(false);
      setPartialFailure(
        failures.length > 0
          ? { jobUid: selectedJob.uid, message: getStudentUploadPartialFailureMessage(failures) }
          : null,
      );
      notifyScannerJobsChanged();
    } catch (uploadError) {
      setPhase("idle");
      setError(toScannerErrorMessage(uploadError));
    }
  }

  async function applyReview(remainingReviewStudentCount: number, excludedStudentUids: ReadonlySet<string>) {
    if (!job?.result) return;
    if (remainingReviewStudentCount > 0 && !window.confirm("검토가 필요한 데이터가 남아있어요. 정말 저장할까요?")) {
      return;
    }

    setError(null);
    try {
      const { students } = buildStudentVideoApplyRequest(
        job.result,
        review,
        new Set(Object.keys(job.studentCatalog ?? {})),
        excludedStudentUids,
      );
      if (students.length === 0) {
        setError("저장할 수 있는 학생 데이터가 없어요.");
        return;
      }

      setPhase("applying");
      const response = await requestScannerJson<{ application: NonNullable<JobApplication> }>(
        `/api/ocr/jobs/${job.uid}/apply`,
        { method: "POST", body: JSON.stringify({ students }) },
      );
      // The summary is read again with the job detail below; until then the completion view shows it is loading.
      updateJob((currentJob) =>
        currentJob ? { ...currentJob, application: response.application, completionSummary: undefined } : null,
      );
      setPhase("applied");
      notifyScannerJobsChanged();
      // A failed re-read leaves no summary to wait for: the completion view then shows its error with a new upload.
      if ((await refreshJob()) === "failed") {
        updateJob((currentJob) => (currentJob ? { ...currentJob, completionSummary: null } : null));
      }
    } catch (applyError) {
      setPhase("review");
      setError(toScannerErrorMessage(applyError));
    }
  }

  function selectFiles(candidates: File[]) {
    if (candidates.length === 0) return;
    const nextFiles = mergeScannerFiles(selectedFiles, candidates);
    const validation = validateScannerFiles(nextFiles, STUDENT_SCANNER_ACCEPT_SPEC);
    if (validation.error) {
      setError(validation.error);
      return;
    }
    setSelectedFiles(nextFiles);
    setHashProgress(0);
    setPartialFailure(null);
    setError(null);
  }

  function clearSelectedFiles() {
    if (phase !== "idle") return;
    setSelectedFiles([]);
    setAllowsTrainingDataUse(false);
    setHashProgress(0);
    setUploadProgress(0);
    setError(null);
    setPartialFailure(null);
  }

  const selectedUpload = validateScannerFiles(selectedFiles, STUDENT_SCANNER_ACCEPT_SPEC);
  const selectedImageBytes = selectedUpload.images.reduce((sum, image) => sum + image.size, 0);
  const selectedQuotaError =
    !selectedJobUid && selectedFiles.length > 0
      ? getStudentUploadQuotaError(selectedUpload, imageUploadQuota, uploadQuota)
      : null;
  const uploadActionDisabled =
    selectedFiles.length === 0 ||
    selectedUpload.error !== null ||
    selectedQuotaError !== null ||
    phase !== "idle" ||
    (selectedUpload.images.length > 0 && (!imageUploadQuota || imageUploadQuota.remaining === 0)) ||
    (selectedUpload.video !== null && (!uploadQuota || uploadQuota.remaining === 0));
  const selectedPartialFailure = getStudentUploadPartialFailureForJob(partialFailure, selectedJobUid);
  const isApplied = job?.application?.status === "applied";
  const isReviewing = job?.status === "review_ready" && job.result != null && !isApplied;
  // Only the stacked upload bar is fixed; the review actions stay in the page flow and stick below its scroll area.
  const showsUploadBar = stacked && !job && !selectedJobUid && selectedFiles.length > 0;
  const hasFixedBar = showsUploadBar;
  // One body per job state. Each step below renders only when it is the body.
  const stepBody = getScannerStepBody({
    hasSelectedJob: selectedJobUid !== null,
    hasJob: job !== null,
    phase,
    isApplied,
    isTerminal: job ? TERMINAL_JOB_STATUSES.has(job.status) : false,
    reviewBody: getStudentReviewBody(job),
  });
  // The site's mobile bar hides only while a step bar takes its place: files chosen for a new upload, or the review.
  // Files kept after a submit do not count, so recognizing and completion show the bar again.
  const hidesMobileActionBar = (!job && !selectedJobUid && selectedFiles.length > 0) || isReviewing;
  useEffect(() => {
    setMobileActionBarHidden(hidesMobileActionBar);
    return () => setMobileActionBarHidden(false);
  }, [hidesMobileActionBar, setMobileActionBarHidden]);

  const stepStates = getStudentStepStates(phase, job);
  const uploadPercent = Math.round((hashProgress < 1 ? hashProgress : uploadProgress) * 100);
  const selectedSummary = [
    selectedUpload.images.length > 0
      ? `이미지 ${selectedUpload.images.length}장 · ${formatScannerBytes(selectedImageBytes)}`
      : null,
    selectedUpload.video ? `영상 ${formatScannerBytes(selectedUpload.video.size)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // The stacked "최근 작업" button shows only while the mobile action bar is hidden (files selected, review).
  const recentJobsButton =
    stacked && hidesMobileActionBar ? (
      <Button variant="secondary" onClick={openJobsPanel}>
        최근 작업
      </Button>
    ) : null;
  const headerAction =
    job && !TERMINAL_JOB_STATUSES.has(job.status) && !isApplied && phase !== "applying" ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => resetForNewUpload()}>
          <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
          {scannerMessages.student.uploadAction}
        </Button>
        {recentJobsButton}
      </div>
    ) : (
      recentJobsButton
    );

  const uploadStep = !selectedJobUid ? (
    <>
      <ScannerStepHeader states={stepStates} action={headerAction}>
        {phase === "uploading" ? (
          <>
            <ScannerStepTitle title="파일 업로드 중" />
            <ProgressBar
              value={hashProgress < 1 ? hashProgress : uploadProgress}
              max={1}
              label={hashProgress < 1 ? "파일 확인 진행률" : "업로드 진행률"}
            />
            <p className="text-sm text-v2-fg-secondary tabular-nums">
              {hashProgress < 1 ? `파일 확인 ${uploadPercent}%` : `업로드 ${uploadPercent}%`}
            </p>
          </>
        ) : (
          <ScannerStepTitle
            title={selectedFiles.length === 0 ? "이미지 또는 영상을 선택해 주세요" : "인식을 시작할 수 있어요"}
          />
        )}
        {selectedQuotaError ? <StatusNotice tone="warning">{selectedQuotaError}</StatusNotice> : null}
        {selectedPartialFailure && phase !== "review" && phase !== "applying" ? (
          <StatusNotice tone="warning">일부 파일만 제출됐어요. {selectedPartialFailure}</StatusNotice>
        ) : null}
      </ScannerStepHeader>
      <ScannerUploadSection
        inputId="student-scanner-files"
        inputLabel="이미지 또는 영상 파일 선택"
        accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,.png,.jpg,.jpeg,.webp,.mp4,.mov"
        multiple
        selectionDisabled={phase !== "idle" || (imageUploadQuota?.remaining === 0 && uploadQuota?.remaining === 0)}
        onFiles={selectFiles}
        targetGuide={<ScannerUploadTargetGuide target="student" />}
        targetPath="[학생] > [기본 정보]"
        selectLabel="이미지·영상 선택"
        helpText="1회당 최대 이미지 30장 또는 영상 1개"
        descriptionLines={[
          "이미지: 게임 내 [학생] 메뉴에서 학생을 한 명 선택하여 [기본 정보] 화면을 띄운 뒤 스크린샷을 찍어주세요.",
          "영상: 같은 화면에서 좌/우 화살표로 이동하는 과정을 녹화해주세요.",
        ]}
        consentChecked={allowsTrainingDataUse}
        consentDisabled={phase !== "idle"}
        onConsentChange={setAllowsTrainingDataUse}
        actionDisabled={uploadActionDisabled}
        actionLabel="인식 시작"
        onAction={startRecognition}
        stacked={stacked}
        hasFiles={selectedFiles.length > 0}
      >
        <ScannerFileList
          files={selectedFiles}
          disabled={phase !== "idle"}
          onRemove={(index) => {
            if (phase !== "idle") return;
            setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
            setError(null);
          }}
          onClear={clearSelectedFiles}
        />
      </ScannerUploadSection>
      {showsUploadBar ? (
        <PageActionBar placement="fixed" summary={selectedSummary}>
          <Button variant="primary" disabled={uploadActionDisabled} onClick={startRecognition}>
            인식 시작
          </Button>
        </PageActionBar>
      ) : null}
    </>
  ) : null;

  const waitingStep =
    phase === "waiting" && job ? (
      <>
        <ScannerStepHeader states={stepStates} action={headerAction}>
          {job.status === "queued" ? (
            <ScannerStepTitle title="인식 대기 중" />
          ) : (
            <>
              <ScannerStepTitle
                title="학생 성장도 인식 중"
                meta={`처리 ${processedStudentCountOf(job)}/${job.progress.total}${job.progress.failed > 0 ? ` · 실패 ${job.progress.failed}` : ""}`}
              />
              <ProgressBar value={processedStudentCountOf(job)} max={job.progress.total} label="인식 진행률" />
            </>
          )}
          <p className="text-sm text-v2-fg-secondary">페이지를 닫아도 인식은 계속돼요.</p>
        </ScannerStepHeader>
        <ScannerFileStatusList items={toStudentFileStatusItems(job)} />
      </>
    ) : null;

  const reviewStep =
    isReviewing && job?.result ? (
      <ReviewPanel
        key={job.uid}
        job={{ ...job, result: job.result }}
        review={review}
        excludedStudentUids={excludedStudentUids}
        phase={phase}
        stepStates={stepStates}
        headerAction={headerAction}
        stacked={stacked}
        onReviewChange={setReview}
        onExcludeStudent={(studentUid) =>
          setExcludedStudentUids((current) => {
            const next = new Set(current);
            next.add(studentUid);
            return next;
          })
        }
        onRestoreStudent={(studentUid) =>
          setExcludedStudentUids((current) => {
            const next = new Set(current);
            next.delete(studentUid);
            return next;
          })
        }
        onApply={applyReview}
        onCancel={cancelResult}
        isCancelling={isCancelling}
        error={error}
        partialFailure={selectedPartialFailure}
      />
    ) : null;

  const completionState = getScannerCompletionState(job?.completionSummary);
  const completionStep =
    job && isApplied ? (
      <>
        <ScannerStepHeader states={stepStates} action={headerAction}>
          <ScannerStepTitle
            title="반영했어요"
            meta={formatScannerQuotaAvailability(job.updatedAt)}
          />
        </ScannerStepHeader>
        {completionState.kind === "summary" ? (
          <ScannerCompletionSummary
            title="반영 결과"
            meta=""
            summary={`반영 ${completionState.summary.appliedCount}명${completionState.summary.excludedCount > 0 ? ` · 제외 ${completionState.summary.excludedCount}명` : ""}`}
            actions={
              <Button variant="primary" className="w-full sm:w-auto" onClick={() => resetForNewUpload()}>
                <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
                {scannerMessages.student.uploadAction}
              </Button>
            }
          >
            <div className="flex flex-col gap-v2-block-gap">
              <StudentCompletionList title="반영한 학생" students={completionState.summary.applied} />
              {completionState.summary.excluded.length > 0 ? (
                <StudentCompletionList title="제외한 학생" students={completionState.summary.excluded} />
              ) : null}
            </div>
          </ScannerCompletionSummary>
        ) : completionState.kind === "loading" ? (
          <ScannerEndBlock
            action={
              <Button variant="primary" onClick={() => resetForNewUpload()}>
                <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
                {scannerMessages.student.uploadAction}
              </Button>
            }
          >
            <p role="status" className="text-sm text-v2-fg-tertiary">
              반영 기록을 불러오고 있어요
            </p>
          </ScannerEndBlock>
        ) : (
          // Without a summary there are no counts to show, but a new upload stays one step away.
          <ScannerEndBlock
            action={
              <Button variant="primary" onClick={() => resetForNewUpload()}>
                <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
                {scannerMessages.student.uploadAction}
              </Button>
            }
          >
            <StatusNotice tone="danger">{completionState.message}</StatusNotice>
          </ScannerEndBlock>
        )}
      </>
    ) : null;

  const endStep =
    job && TERMINAL_JOB_STATUSES.has(job.status) ? (
      <>
        <ScannerStepHeader states={stepStates}>
          <ScannerStepTitle
            title={getScannerTerminalJobTitle(job.status, job.jobKind)}
            meta={formatScannerRelativeTime(job.createdAt)}
          />
        </ScannerStepHeader>
        <ScannerEndBlock
          action={
            <Button variant="primary" onClick={() => resetForNewUpload()}>
              <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
              {scannerMessages.student.uploadAction}
            </Button>
          }
        >
          {getScannerTerminalJobDescription(job.status, job.jobKind, job.images)}
        </ScannerEndBlock>
      </>
    ) : null;

  // The unavailable state: the explicit notice, with no computed counts and no retry. The actions are "결과 삭제" and "새로 업로드".
  const unavailableStep =
    job?.status === "review_ready" && (!job.result || job.resultInvalid) ? (
      <ScannerStepHeader states={stepStates}>
        <ScannerStepTitle title="학생 인식 결과를 확인하지 못했어요" />
        <StatusNotice tone="danger">{getScannerUnavailableResultMessage()}</StatusNotice>
        {/* The transition stores the unavailable message as the error; anything else is a failed delete request. */}
        {error && error !== getScannerUnavailableResultMessage() ? (
          <StatusNotice tone="danger">{error}</StatusNotice>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={isCancelling} onClick={cancelResult}>
            {isCancelling ? "삭제 중..." : "결과 삭제"}
          </Button>
          <Button variant="primary" disabled={isCancelling} onClick={() => resetForNewUpload()}>
            <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
            {scannerMessages.student.uploadAction}
          </Button>
        </div>
      </ScannerStepHeader>
    ) : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-v2-block-gap",
        hasFixedBar ? "pb-[calc(var(--mobile-nav-height)+5.5rem)]" : "pb-v2-block-p",
      )}
    >
      {error && stepBody !== "unavailable" && phase !== "review" && phase !== "applying" ? (
        <StatusNotice tone="danger">{error}</StatusNotice>
      ) : null}
      {statusError ? (
        <ScannerJobStatusNotice
          title={getScannerJobStatusView(statusError.kind).title}
          action={getScannerJobStatusView(statusError.kind).action}
          onRetry={() => void refreshJob()}
          onStartNew={() => resetForNewUpload(false)}
          startNewLabel={scannerMessages.student.uploadAction}
        />
      ) : null}
      {selectedJobUid && !job && !statusError ? <ScannerJobSkeleton /> : null}
      {stepBody === "upload" ? uploadStep : null}
      {stepBody === "waiting" ? waitingStep : null}
      {stepBody === "review" ? reviewStep : null}
      {stepBody === "completion" ? completionStep : null}
      {stepBody === "terminal" ? endStep : null}
      {stepBody === "unavailable" ? unavailableStep : null}
    </div>
  );
}

// Completion uses the same portrait cards as the student lists elsewhere in the app.
function StudentCompletionList({
  title,
  students,
}: {
  title: string;
  students: ReadonlyArray<{ uid: string; name?: string | null }>;
}) {
  return (
    <div className="flex flex-col gap-v2-group-gap">
      <p className="text-sm font-semibold text-v2-fg">{title}</p>
      <ul className="flex flex-wrap gap-3">
        {students.map((student) => <StudentCompletionCard key={student.uid} student={student} />)}
      </ul>
    </div>
  );
}

function StudentCompletionCard({ student }: { student: { uid: string; name?: string | null } }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const studentName = student.name ?? "학생 정보 없음";
  const { name, variant } = splitVisibleStudentName(studentName);

  return (
    <li title={studentName}>
      <StudentThumb
        ref={triggerRef}
        studentUid={student.uid}
        name={name}
        variant={variant}
        recruitmentLabel=""
        isNew={false}
        favorite={NO_FAVORITE_LABEL}
        showRecruitmentLabel={false}
        onOpen={student.name ? () => setOpen(true) : undefined}
        expanded={open}
      />
      {student.name ? (
        <Popover
          open={open}
          label={`${studentName} 빠른 보기`}
          onClose={() => setOpen(false)}
          returnFocusRef={triggerRef}
          className="w-64 p-3"
        >
          <p className="mb-2 text-sm font-semibold text-v2-fg">{studentName}</p>
          <Link
            to={`/students/${student.uid}`}
            prefetch="intent"
            className="flex min-h-v2-row-min items-center rounded-md px-2 text-sm text-v2-fg hover:bg-v2-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
          >
            학생부 보기 (평가·통계)
          </Link>
        </Popover>
      ) : null}
    </li>
  );
}

const NO_FAVORITE_LABEL: FavoriteLabelState = {
  visible: false,
  icon: "unfavorited",
  countText: null,
  accessibleName: "",
};

function processedStudentCountOf(job: StudentVideoJob): number {
  return job.progress.completed + job.progress.failed;
}

function toStudentFileStatusItems(job: StudentVideoJob): ScannerFileStatusItem[] {
  const items: ScannerFileStatusItem[] = job.images.map((image) => ({
    key: image.uid,
    name: image.filename,
    status: toFileStatus(image.status),
  }));
  if (job.video) {
    items.push({ key: `video:${job.video.inputUid}`, name: "영상", status: toFileStatus(job.video.status) });
  }
  return items;
}

function toFileStatus(status: string): ScannerFileStatusItem["status"] {
  if (status === "succeeded") return "done";
  if (status === "failed") return "failed";
  if (status === "queued") return "queued";
  return "processing";
}

// The review body for a reviewable job. A missing or unreadable result is the unavailable state, never a review.
export function getStudentReviewBody(
  job: Pick<StudentVideoJob, "status" | "result" | "resultInvalid"> | null,
): "review" | "unavailable" | null {
  if (job?.status !== "review_ready") return null;
  return job.result && !job.resultInvalid ? "review" : "unavailable";
}

export function getStudentStepStates(phase: ScannerPhase, job: StudentVideoJob | null): ScannerStepStates {
  if (!job) return ["active", "pending", "pending", "pending"];
  if (job.status === "expired") return ["failed", "pending", "pending", "pending"];
  if (job.status === "cancelled") return ["pending", "pending", "pending", "pending"];
  if (job.status === "failed") return ["done", "failed", "pending", "pending"];
  if (["queued", "processing", "finalizing"].includes(job.status)) return ["done", "active", "pending", "pending"];
  if (job.status === "review_ready" && !job.result) return ["done", "done", "failed", "pending"];
  if (job.application?.status === "applied") return ["done", "done", "done", "done"];
  if (phase === "applying") return ["done", "done", "done", "active"];
  return ["done", "done", "active", "pending"];
}

function ReviewPanel({
  job,
  review,
  excludedStudentUids,
  phase,
  stepStates,
  headerAction,
  stacked,
  onReviewChange,
  onExcludeStudent,
  onRestoreStudent,
  onApply,
  onCancel,
  isCancelling,
  error,
  partialFailure,
}: {
  job: StudentVideoJob & { result: StudentGrowthResult };
  review: ReviewState;
  excludedStudentUids: ReadonlySet<string>;
  phase: ScannerPhase;
  stepStates: ScannerStepStates;
  headerAction: ReactNode;
  stacked: boolean;
  onReviewChange: Dispatch<SetStateAction<ReviewState>>;
  onExcludeStudent: (studentUid: string) => void;
  onRestoreStudent: (studentUid: string) => void;
  onApply: (remainingReviewStudentCount: number, excludedStudentUids: ReadonlySet<string>) => void;
  onCancel: () => void;
  isCancelling: boolean;
  error: string | null;
  partialFailure: string | null;
}) {
  const [reviewFilterStudentUids, setReviewFilterStudentUids] = useState<string[] | null>(null);
  const [pendingFocusTarget, setPendingFocusTarget] = useState<PendingFocusTarget | null>(null);
  const [exclusionAnnouncement, setExclusionAnnouncement] = useState("");
  const [selectedPreview, setSelectedPreview] = useState<{
    artifact: StudentVideoJob["artifacts"][number];
    studentName: string;
  } | null>(null);
  const excludeButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const actionBarRef = useRef<HTMLDivElement>(null);
  const activeStudents = job.result.students.filter(({ studentUid }) => !excludedStudentUids.has(studentUid));
  const failedImages = job.images.filter((image) => image.status === "failed");
  const artifactsByStudentUid = new Map(job.artifacts.map((artifact) => [artifact.studentUid, artifact]));
  const numberInputNavigation = useNumberInputFlowNavigation();
  const remainingReviewStudents = activeStudents.filter((student) => {
    const state = review[student.studentUid];
    return state ? studentNeedsReview(student, state, job.currentStudentStates?.[student.studentUid]) : false;
  });
  const validStudentUids = new Set(Object.keys(job.studentCatalog ?? {}));
  const saveableStudentCount = activeStudents.filter(
    (student) => review[student.studentUid]?.confirmed.tier && validStudentUids.has(student.studentUid),
  ).length;
  const showReviewRequiredOnly = reviewFilterStudentUids !== null;
  // An excluded student keeps its row, dimmed with a restore action, so the list does not shift under the pointer.
  const visibleStudents = showReviewRequiredOnly
    ? job.result.students.filter(({ studentUid }) => reviewFilterStudentUids.includes(studentUid))
    : job.result.students;
  const hasExistingValuesBelow = visibleStudents.some((student) => {
    if (excludedStudentUids.has(student.studentUid)) return false;
    const state = review[student.studentUid];
    if (!state) return false;
    const currentState = job.currentStudentStates?.[student.studentUid];
    return fields.some(
      ({ resultKey, applyKey }) =>
        getFieldComparison(
          student.fieldDetails[resultKey],
          state.values[applyKey],
          currentState?.[applyKey],
          state.confirmed[applyKey],
        ) === "decreased",
    );
  });

  useEffect(() => {
    if (!pendingFocusTarget) return;
    if (pendingFocusTarget.kind === "student") {
      const nextButton = excludeButtonRefs.current.get(pendingFocusTarget.studentUid);
      if (nextButton && !nextButton.disabled) {
        nextButton.focus();
      } else {
        actionBarRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      }
    } else {
      actionBarRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    }
    setPendingFocusTarget(null);
  }, [pendingFocusTarget]);

  const updateStudent = (studentUid: string, update: (current: ReviewStudent) => ReviewStudent) => {
    onReviewChange((current) => {
      const currentStudent = current[studentUid];
      if (!currentStudent) return current;
      return { ...current, [studentUid]: update(currentStudent) };
    });
  };

  const excludeStudent = (studentUid: string, studentName: string) => {
    const focusableStudents = visibleStudents.filter(
      (student) => student.studentUid === studentUid || !excludedStudentUids.has(student.studentUid),
    );
    const currentIndex = focusableStudents.findIndex((student) => student.studentUid === studentUid);
    const nextFocusStudentUid =
      focusableStudents[currentIndex + 1]?.studentUid ?? focusableStudents[currentIndex - 1]?.studentUid ?? null;
    setPendingFocusTarget(
      nextFocusStudentUid === null ? { kind: "action-bar" } : { kind: "student", studentUid: nextFocusStudentUid },
    );
    setExclusionAnnouncement(`${studentName} 학생을 저장 대상에서 제외했어요.`);
    onExcludeStudent(studentUid);
  };

  const registerExcludeButton = (studentUid: string) => (element: HTMLButtonElement | null) => {
    if (!element) {
      excludeButtonRefs.current.delete(studentUid);
      return;
    }
    excludeButtonRefs.current.set(studentUid, element);
  };

  const restoreStudent = (studentUid: string, studentName: string) => {
    setPendingFocusTarget({ kind: "student", studentUid });
    setExclusionAnnouncement(`${studentName} 학생을 다시 저장 대상에 넣었어요.`);
    onRestoreStudent(studentUid);
  };

  const rowsEmpty =
    visibleStudents.length === 0 ? (
      <p className="rounded-lg bg-v2-surface px-4 py-8 text-center text-sm text-v2-fg-tertiary">
        {showReviewRequiredOnly ? "검토가 필요한 데이터가 없습니다." : "저장할 학생이 없습니다."}
      </p>
    ) : null;

  const updateValueFor = (studentUid: string) => (field: ApplyFieldName, value: number | null) =>
    updateStudent(studentUid, (current) => ({
      ...current,
      confirmed: { ...current.confirmed, [field]: value !== null },
      values: { ...current.values, [field]: value === null ? "" : String(value) },
    }));

  return (
    <>
      {exclusionAnnouncement ? (
        <p role="status" aria-live="polite" className="sr-only">
          {exclusionAnnouncement}
        </p>
      ) : null}
      <ScannerStepHeader states={stepStates} action={headerAction}>
        <ScannerStepTitle title="인식 결과" />
        {error ? <StatusNotice tone="danger">{error}</StatusNotice> : null}
        {partialFailure ? <StatusNotice tone="warning">{partialFailure}</StatusNotice> : null}
        {failedImages.length > 0 ? (
          <StatusNotice tone="danger">
            <span className="block">이미지 {failedImages.length}장 인식 실패</span>
            <span className="block text-v2-fg-secondary">{getStudentFailedImagesDescription(failedImages)}</span>
          </StatusNotice>
        ) : null}
      </ScannerStepHeader>
      <div className="flex flex-col gap-v2-block-gap">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-sm font-semibold text-v2-fg tabular-nums">학생 {job.result.students.length}명</p>
            {hasExistingValuesBelow ? (
              <p className="text-xs text-v2-fg-tertiary">입력칸 아래 숫자는 기존 값</p>
            ) : null}
          </div>
          <Switch
            id={`student-review-filter-${job.uid}`}
            label="확인이 필요한 학생만 보기"
            checked={showReviewRequiredOnly}
            onCheckedChange={(checked) =>
              setReviewFilterStudentUids(checked ? remainingReviewStudents.map(({ studentUid }) => studentUid) : null)
            }
          />
        </div>

        {stacked ? (
          <div className="flex flex-col gap-v2-block-gap">
            {visibleStudents.map((student) => {
              const state = review[student.studentUid];
              const catalogStudent = job.studentCatalog?.[student.studentUid];
              const studentName = catalogStudent?.name ?? student.studentName;
              const artifact = artifactsByStudentUid.get(student.studentUid);
              if (!state) return null;
              const excluded = excludedStudentUids.has(student.studentUid);
              const initialTier = catalogStudent?.initialTier ?? tierField.min;
              return (
                <article key={student.studentUid} className="flex flex-col gap-3 rounded-lg bg-v2-surface p-v2-block-p">
                  <StudentIdentity
                    studentUid={catalogStudent?.uid ?? null}
                    name={studentName}
                    unavailable={!catalogStudent}
                    excluded={excluded}
                    stacked
                    onPreview={artifact ? () => setSelectedPreview({ artifact, studentName }) : null}
                    onExclude={() => excludeStudent(student.studentUid, studentName)}
                    onRestore={() => restoreStudent(student.studentUid, studentName)}
                    excludeRef={registerExcludeButton(student.studentUid)}
                    excludeDisabled={phase === "applying" || isCancelling}
                  />
                  {excluded ? (
                    <p className="text-sm text-v2-fg-tertiary">제외됨 · 반영하지 않아요</p>
                  ) : (
                    REVIEW_GROUPS.map((group) => (
                      <ReviewCardGroup key={group.label} label={group.label}>
                        <ReviewFieldGroup
                          fields={group.fields}
                          studentName={studentName}
                          student={student}
                          state={state}
                          currentState={job.currentStudentStates?.[student.studentUid]}
                          disabled={!catalogStudent}
                          getInputProps={numberInputNavigation.getInputProps}
                          onValueChange={updateValueFor(student.studentUid)}
                          initialTier={initialTier}
                          equipments={catalogStudent?.equipments}
                          mobile
                        />
                      </ReviewCardGroup>
                    ))
                  )}
                </article>
              );
            })}
            {rowsEmpty}
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto rounded-lg bg-v2-surface">
            <table className="w-full min-w-[50rem] table-fixed border-separate border-spacing-0 text-sm">
              <colgroup>
                <col className="w-[12rem]" />
                {REVIEW_GROUPS.map((group, groupIndex) => (
                  <col key={group.label} className={reviewGroupColumnClassName(group.fields.length, groupIndex)} />
                ))}
              </colgroup>
              <thead className="text-xs">
                <tr>
                  <th
                    scope="col"
                    rowSpan={2}
                    className={cn(
                      "sticky top-0 left-0 z-30 bg-v2-surface pr-3 pb-1.5 pl-v2-block-p text-left align-bottom font-semibold text-v2-fg-secondary",
                      tableDividerStartClassName,
                    )}
                  >
                    학생
                  </th>
                  {REVIEW_GROUPS.map((group, groupIndex) => (
                    <th
                      key={group.label}
                      scope="colgroup"
                      className={cn(
                        "sticky top-0 z-20 h-9 bg-v2-surface text-left align-bottom font-semibold text-v2-fg-secondary",
                        reviewGroupCellClassName(groupIndex),
                      )}
                    >
                      <span className="block border-b border-v2-divider pb-1 leading-4">{group.label}</span>
                    </th>
                  ))}
                </tr>
                <tr>
                  {REVIEW_GROUPS.map((group, groupIndex) => (
                    <th
                      key={group.label}
                      scope="col"
                      className={cn(
                        "sticky top-9 z-20 h-7 bg-v2-surface font-medium text-v2-fg-tertiary",
                        reviewGroupCellClassName(groupIndex),
                        groupIndex === REVIEW_GROUPS.length - 1
                          ? tableDividerEndClassName
                          : "border-b border-v2-divider",
                      )}
                    >
                      <span className={cn("grid", group.fields.length === 3 ? "grid-cols-3" : "grid-cols-4")}>
                        {group.fields.map((field) => (
                          <span key={field.resultKey} className="truncate text-center">
                            {getReviewFieldLabel(field)}
                          </span>
                        ))}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((student, rowIndex) => {
                  const state = review[student.studentUid];
                  const catalogStudent = job.studentCatalog?.[student.studentUid];
                  const studentName = catalogStudent?.name ?? student.studentName;
                  const artifact = artifactsByStudentUid.get(student.studentUid);
                  if (!state) return null;
                  const excluded = excludedStudentUids.has(student.studentUid);
                  const currentState = job.currentStudentStates?.[student.studentUid];
                  const initialTier = catalogStudent?.initialTier ?? tierField.min;
                  const lastRow = rowIndex === visibleStudents.length - 1;

                  return (
                    <tr key={student.studentUid} className={cn(!catalogStudent && "opacity-60")}>
                      <th
                        scope="row"
                        className={cn(
                          "sticky left-0 z-10 bg-v2-surface py-2 pr-2 pl-v2-block-p text-left align-top font-medium",
                          !lastRow && tableDividerStartClassName,
                        )}
                      >
                        <StudentIdentity
                          studentUid={catalogStudent?.uid ?? null}
                          name={studentName}
                          unavailable={!catalogStudent}
                          excluded={excluded}
                          stacked={false}
                          onPreview={artifact ? () => setSelectedPreview({ artifact, studentName }) : null}
                          onExclude={() => excludeStudent(student.studentUid, studentName)}
                          onRestore={() => restoreStudent(student.studentUid, studentName)}
                          excludeRef={registerExcludeButton(student.studentUid)}
                          excludeDisabled={phase === "applying" || isCancelling}
                        />
                      </th>
                      {excluded ? (
                        <td
                          colSpan={REVIEW_GROUPS.length}
                          className={cn(
                            "pr-v2-block-p pl-3 align-middle text-sm text-v2-fg-tertiary",
                            !lastRow && tableDividerEndClassName,
                          )}
                        >
                          제외됨 · 반영하지 않아요
                        </td>
                      ) : (
                        REVIEW_GROUPS.map((group, groupIndex) => (
                          <td
                            key={group.label}
                            className={cn(
                              "py-2 align-top",
                              reviewGroupCellClassName(groupIndex),
                              !lastRow &&
                                (groupIndex === REVIEW_GROUPS.length - 1
                                  ? tableDividerEndClassName
                                  : "border-b border-v2-divider"),
                            )}
                          >
                            <ReviewFieldGroup
                              fields={group.fields}
                              studentName={studentName}
                              student={student}
                              state={state}
                              currentState={currentState}
                              disabled={!catalogStudent}
                              getInputProps={numberInputNavigation.getInputProps}
                              onValueChange={updateValueFor(student.studentUid)}
                              initialTier={initialTier}
                              equipments={catalogStudent?.equipments}
                            />
                          </td>
                        ))
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rowsEmpty}
          </div>
        )}
      </div>
      <PageActionBar
        ref={actionBarRef}
        placement="sticky"
        expandActions
        className="bottom-0 rounded-none bg-v2-canvas px-0 py-v2-block-gap shadow-none"
        summary={phase === "applying" ? "반영 중이에요" : null}
      >
        <Button variant="danger" disabled={phase === "applying" || isCancelling} onClick={onCancel}>
          {isCancelling ? "삭제 중..." : "결과 삭제"}
        </Button>
        <Button
          variant="primary"
          aria-label={`${saveableStudentCount}명 반영`}
          disabled={phase === "applying" || isCancelling || saveableStudentCount === 0}
          onClick={() => onApply(remainingReviewStudents.length, excludedStudentUids)}
        >
          반영
        </Button>
      </PageActionBar>
      <ScannerImageDialog
        open={selectedPreview !== null}
        src={
          selectedPreview
            ? `/api/ocr/jobs/${encodeURIComponent(job.uid)}/artifacts/${encodeURIComponent(selectedPreview.artifact.uid)}`
            : ""
        }
        title={
          selectedPreview
            ? `${selectedPreview.studentName} 인식 화면 · ${selectedPreview.artifact.timestampSeconds.toFixed(1)}초`
            : "인식 화면"
        }
        alt={selectedPreview ? `${selectedPreview.studentName} 인식 화면` : "인식 화면"}
        onClose={() => setSelectedPreview(null)}
      />
    </>
  );
}

// Keep preview and exclusion actions beside the student's name, with visible labels on both layouts.
function StudentIdentity({
  studentUid,
  name,
  unavailable,
  excluded,
  stacked,
  onPreview,
  onExclude,
  onRestore,
  excludeRef,
  excludeDisabled,
}: {
  studentUid: string | null;
  name: string;
  unavailable: boolean;
  excluded: boolean;
  stacked: boolean;
  onPreview: (() => void) | null;
  onExclude: () => void;
  onRestore: () => void;
  excludeRef: (element: HTMLButtonElement | null) => void;
  excludeDisabled: boolean;
}) {
  const status = unavailable ? <span className="text-xs font-semibold text-v2-danger">반영 불가</span> : null;
  // The focus after an exclusion or a restore lands on this row's action, through the wrapper's button.
  const registerAction = (wrapper: HTMLSpanElement | null) =>
    excludeRef(wrapper?.querySelector<HTMLButtonElement>("button") ?? null);
  const actionClassName = cn(
    "border border-v2-control-border bg-v2-surface px-1.5 text-v2-fg-secondary hover:bg-v2-hover hover:text-v2-fg",
    stacked ? "min-h-8 text-sm" : "min-h-6 text-[0.6875rem]",
  );
  const nameLine = (
    <span
      className={cn(
        "block min-w-0 truncate",
        stacked ? "text-base font-semibold leading-5" : "text-xs leading-4",
        excluded ? "text-v2-fg-tertiary" : "text-v2-fg",
      )}
      title={name}
    >
      {formatVisibleName(name)}
    </span>
  );

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={cn("block shrink-0", excluded && "opacity-40")}>
        <StudentThumb
          studentUid={studentUid}
          name={name}
          variant={null}
          recruitmentLabel=""
          isNew={false}
          favorite={NO_FAVORITE_LABEL}
          compact
          showCaption={false}
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {nameLine}
        {status}
        <div className="flex flex-wrap items-center gap-1">
          {onPreview && !excluded ? (
            <Button
              variant="text"
              className={actionClassName}
              aria-label={`${name} 인식 화면 보기`}
              onClick={onPreview}
            >
              인식 화면
            </Button>
          ) : null}
          <span ref={registerAction} className="inline-flex">
            <Button
              variant="text"
              className={actionClassName}
              aria-label={excluded ? `${name} 학생 제외 취소` : `${name} 학생을 반영 대상에서 제외`}
              disabled={excludeDisabled}
              onClick={excluded ? onRestore : onExclude}
            >
              {excluded ? "제외 취소" : "반영 제외"}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

// The table and the mobile cards show the same fields. The label drops the "학생 " prefix, such as "Lv".
// The value input shows every digit: no side padding, and the spin buttons are hidden (shared scanner input class).
const valueInputClassName = cn("px-0", scannerNumberInputClassName);

function getReviewFieldLabel(field: FieldDefinition, equipments?: readonly string[]): string {
  const equipmentIndex = ["equip1", "equip2", "equip3"].indexOf(field.resultKey);
  if (equipmentIndex >= 0 && equipments) {
    const equipmentType = equipments[equipmentIndex];
    return equipmentType ? (EQUIPMENT_TYPE_LABELS[equipmentType] ?? "장비 정보 없음") : "장비 정보 없음";
  }
  return field.label.replace("학생 ", "");
}

// The review groups in column order. Each group has one header over its fields.
const REVIEW_GROUPS: ReadonlyArray<{ label: string; fields: readonly FieldDefinition[] }> = [
  { label: "기본 정보", fields: [tierField, ...basicNumberFields] },
  { label: "스킬", fields: skillFields },
  { label: "장비", fields: equipmentFields },
  { label: "능력 개방", fields: abilityFields },
];

// Each value is a 2.375rem segment of its group's box. The first group keeps 0.75rem from the student column,
// the groups keep 0.75rem between them, and the last one carries the panel padding on the right.
function reviewGroupCellClassName(groupIndex: number): string {
  return cn(groupIndex === 0 ? "pl-3" : "pl-1.5", groupIndex === REVIEW_GROUPS.length - 1 ? "pr-v2-block-p" : "pr-1.5");
}

function reviewGroupColumnClassName(fieldCount: number, groupIndex: number): string {
  if (groupIndex === REVIEW_GROUPS.length - 1) return fieldCount === 3 ? "w-[8.75rem]" : "w-[11.125rem]";
  if (groupIndex === 0) return fieldCount === 3 ? "w-[8.25rem]" : "w-[10.625rem]";
  return fieldCount === 3 ? "w-[7.875rem]" : "w-[10.25rem]";
}

// Row dividers stop at the panel padding on both ends, so every rule lines up with the content edge.
// The sticky student cell draws its part of the rule as a background, because it covers what scrolls under it.
const tableDividerStartClassName =
  "[background:linear-gradient(var(--color-v2-divider),var(--color-v2-divider))_right_bottom/calc(100%-var(--spacing-v2-block-p))_1px_no-repeat,var(--color-v2-surface)]";
const tableDividerEndClassName =
  "[background:linear-gradient(var(--color-v2-divider),var(--color-v2-divider))_left_bottom/calc(100%-var(--spacing-v2-block-p))_1px_no-repeat,var(--color-v2-surface)]";

// A mobile card group: the heading sits above four full-width field columns.
function ReviewCardGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="text-sm font-semibold text-v2-fg-secondary">{label}</p>
      {children}
    </div>
  );
}

type ReviewGroupProps = {
  studentName: string;
  student: StudentGrowthStudent;
  state: ReviewStudent;
  currentState?: CurrentStudentState;
  disabled: boolean;
  getInputProps: (options?: { disabled?: boolean }) => NumberInputFlowNavigationInputProps;
  onValueChange: (field: ApplyFieldName, value: number | null) => void;
  equipments?: readonly string[];
};

type ReviewFieldProps = ReviewGroupProps & {
  field: FieldDefinition;
  initialTier: number;
};

// The value control for one field: the tier box, a number input, or the mark of a value the recognizer did not read.
// A segment sits inside a grouped box (the table), so it drops its own border and corners; the group draws them.
function ReviewFieldInput({
  studentName,
  field,
  student,
  state,
  currentState,
  disabled,
  getInputProps,
  onValueChange,
  equipments,
  initialTier,
  segment,
  compact = segment,
}: ReviewFieldProps & { segment: boolean; compact?: boolean }) {
  const detail = student.fieldDetails[field.resultKey];
  const value = state.values[field.applyKey];
  const warning = fieldNeedsReview(detail, value, state.confirmed[field.applyKey], currentState?.[field.applyKey]);
  const matchesExisting =
    !warning &&
    getFieldComparison(detail, value, currentState?.[field.applyKey], state.confirmed[field.applyKey]) === "same";
  const segmentClassName = segment
    ? cn(segmentInputClassName, !warning && "bg-transparent")
    : "focus:border-v2-control-border-strong focus-within:border-v2-control-border-strong";
  const inputClassName = cn(
    segmentClassName,
    "font-normal",
    matchesExisting && "text-v2-fg-secondary focus:text-v2-fg focus-visible:text-v2-fg",
  );
  if (field.resultKey === tierField.resultKey) {
    return (
      <ReviewTierInput
        studentName={studentName}
        detail={detail}
        value={value}
        warning={warning}
        initialTier={initialTier}
        disabled={disabled}
        inputProps={getInputProps({ disabled })}
        onChange={(tier) => onValueChange(field.applyKey, tier)}
        className={inputClassName}
        segment={segment}
        compact={compact}
      />
    );
  }
  return (
    <ReviewNumberInput
      studentName={studentName}
      field={field}
      detail={detail}
      value={value}
      warning={warning}
      disabled={disabled}
      inputProps={getInputProps({ disabled })}
      onValueChange={onValueChange}
      fieldLabel={getReviewFieldLabel(field, equipments)}
      className={inputClassName}
      segment={segment}
      compact={compact}
    />
  );
}

// A segment of a grouped box: no border or corners of its own, and a focus ring drawn inside, so the group clips nothing.
const segmentInputClassName = "rounded-none border-0 outline-offset-[-2px] focus-within:outline-offset-[-2px]";

// One group of values in the table: one bordered box split by inner rules, with the caption line under each value.
function ReviewFieldGroup({
  fields: groupFields,
  mobile = false,
  ...props
}: ReviewGroupProps & { fields: readonly FieldDefinition[]; initialTier: number; mobile?: boolean }) {
  const gridClassName = groupFields.length === 3 ? "grid-cols-3" : "grid-cols-4";
  return (
    <div className="flex flex-col">
      {mobile ? (
        <div className={cn("grid", gridClassName)}>
          {groupFields.map((field) => (
            <span key={field.resultKey} className="h-4 text-center text-xs leading-4 text-v2-fg-tertiary">
              {getReviewFieldLabel(field, props.equipments ?? [])}
            </span>
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          "grid divide-x divide-v2-control-border overflow-hidden rounded-md border border-v2-control-border bg-v2-surface focus-within:border-v2-control-border-strong",
          gridClassName,
        )}
      >
        {groupFields.map((field) => (
          <ReviewFieldInput key={field.resultKey} {...props} field={field} segment />
        ))}
      </div>
      <div className={cn("grid", gridClassName)}>
        {groupFields.map((field) => (
          <ReviewFieldMeta
            key={field.resultKey}
            detail={props.student.fieldDetails[field.resultKey]}
            value={props.state.values[field.applyKey]}
            currentValue={props.currentState?.[field.applyKey] ?? null}
            confirmed={props.state.confirmed[field.applyKey]}
            tier={field.resultKey === tierField.resultKey}
            reserveLine={!mobile}
          />
        ))}
      </div>
    </div>
  );
}

// A value the recognizer did not read. On its own it keeps the input's shape with a dashed box; as a segment it is the mark only.
function ReviewUnavailableValue({
  state,
  segment,
  compact,
  small = false,
}: {
  state: StudentVideoFieldState;
  segment: boolean;
  compact: boolean;
  small?: boolean;
}) {
  return (
    <div
      title={state === "not_applicable" ? "해당 없음" : "인식 결과 없음"}
      className={cn(
        "flex items-center justify-center text-sm text-v2-fg-tertiary",
        compact ? "min-h-7" : "min-h-v2-input-min",
        small && "text-xs",
        !segment && "rounded-md border border-dashed border-v2-control-border",
      )}
    >
      <UnavailableFieldValue state={state} />
    </div>
  );
}

function ReviewTierInput({
  studentName,
  detail,
  value,
  warning,
  initialTier,
  disabled,
  inputProps,
  onChange,
  className,
  segment,
  compact,
}: {
  studentName: string;
  detail: StudentFieldDetail;
  value: string;
  warning: boolean;
  initialTier: number;
  disabled: boolean;
  inputProps: NumberInputFlowNavigationInputProps;
  onChange: (tier: number) => void;
  className?: string;
  segment: boolean;
  compact: boolean;
}) {
  const recognized = detail.state === "recognized";
  if (!recognized && !isRecognitionFailure(detail.state)) {
    return <ReviewUnavailableValue state={detail.state} segment={segment} compact={compact} />;
  }
  const lowAccuracy = recognized && detail.confidence < LOW_ACCURACY_THRESHOLD;
  return (
    <div title={lowAccuracy ? `인식 정확도 ${formatConfidence(detail.confidence)}` : undefined}>
      <TierInput
        label={studentName}
        value={value === "" ? null : Number(value)}
        initialTier={initialTier}
        min={tierField.min}
        max={tierField.max}
        disabled={disabled}
        warning={warning}
        compact={compact}
        flowProps={inputProps}
        onChange={onChange}
        className={cn(className, segment && "h-full")}
      />
    </div>
  );
}

function ReviewNumberInput({
  studentName,
  field,
  fieldLabel,
  detail,
  value,
  warning,
  disabled,
  inputProps,
  onValueChange,
  className,
  segment,
  compact,
}: {
  studentName: string;
  field: FieldDefinition;
  fieldLabel: string;
  detail: StudentFieldDetail;
  value: string;
  warning: boolean;
  disabled: boolean;
  inputProps: NumberInputFlowNavigationInputProps;
  onValueChange: (field: ApplyFieldName, value: number | null) => void;
  className?: string;
  segment: boolean;
  compact: boolean;
}) {
  const recognized = detail.state === "recognized";
  if (!recognized && !isRecognitionFailure(detail.state)) {
    return (
      <ReviewUnavailableValue
        state={detail.state}
        segment={segment}
        compact={compact}
        small={field.resultKey === "equipSpecial" && detail.state === "not_applicable"}
      />
    );
  }
  const lowAccuracy = recognized && detail.confidence < LOW_ACCURACY_THRESHOLD;
  return (
    <div title={lowAccuracy ? `인식 정확도 ${formatConfidence(detail.confidence)}` : undefined} className="min-w-0">
      <NumberInput
        {...inputProps}
        compact={compact}
        min={field.min}
        max={field.max}
        value={value}
        disabled={disabled}
        warning={warning}
        className={cn(valueInputClassName, className)}
        aria-label={`${studentName} ${fieldLabel} ${recognized ? "인식 결과" : "인식 결과 직접 입력"}`}
        onChange={(event) => {
          const nextValue = event.currentTarget.value === "" ? null : Number(event.currentTarget.value);
          onValueChange(field.applyKey, nextValue);
        }}
      />
    </div>
  );
}

// One caption line under a value, only when it helps the check: an unconfirmed recognition failure first,
// then the saved value when the new value is lower, then a value the user typed after a failure.
// The saved value of a failed cell and the recognition accuracy stay in the tooltip.
function ReviewFieldMeta({
  detail,
  value,
  currentValue,
  confirmed,
  tier = false,
  reserveLine,
}: {
  detail: StudentFieldDetail;
  value: string;
  currentValue: number | null;
  confirmed: boolean;
  tier?: boolean;
  // The table keeps the line empty when there is no caption, so every row has the same height.
  reserveLine: boolean;
}) {
  const failed = isRecognitionFailure(detail.state);
  const decreased = getFieldComparison(detail, value, currentValue, confirmed) === "decreased";
  const savedValue =
    currentValue === null ? null : (
      <span className="inline-flex items-center gap-0.5 tabular-nums">
        <span className="sr-only">기존 값 </span>
        {tier ? <GrowthTier tier={currentValue} /> : currentValue}
      </span>
    );
  const caption =
    failed && !confirmed ? (
      <span
        className="font-medium text-v2-danger"
        title={[fieldFailureReason(detail.state), currentValue === null ? null : `저장된 값 ${currentValue}`]
          .filter(Boolean)
          .join(" · ")}
      >
        인식 실패
      </span>
    ) : decreased ? (
      savedValue
    ) : failed ? (
      "직접 입력"
    ) : null;

  if (!caption && !reserveLine) return null;
  return (
    <span
      className="block h-4 truncate text-center text-[0.6875rem] leading-4 text-v2-fg-tertiary"
      title={decreased && currentValue !== null ? `저장된 값 ${currentValue}` : undefined}
    >
      {caption}
    </span>
  );
}

// Growth tier label: stars for 1 to 5, and the exclusive weapon icon with its level after 5.
function GrowthTier({ tier }: { tier: number }) {
  if (tier <= 5) {
    return <span>★{tier}</span>;
  }

  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`고유무기 ${tier - 5}`}>
      <img className="size-3 shrink-0" src="/icons/exclusive_weapon.png" alt="" aria-hidden="true" />
      <span>{tier - 5}</span>
    </span>
  );
}

function UnavailableFieldValue({ state }: { state: StudentVideoFieldState }) {
  return {
    recognized: "",
    not_applicable: "없음",
    unknown: "—",
    conflict: "—",
  }[state];
}

function isRecognitionFailure(state: StudentVideoFieldState): state is "unknown" | "conflict" {
  return state === "unknown" || state === "conflict";
}

export function getFieldComparison(
  detail: StudentFieldDetail,
  proposedValue: string,
  currentValue?: number | null,
  confirmed = detail.state === "recognized",
): FieldComparison {
  if (!confirmed || currentValue == null) return null;

  const numericValue = Number(proposedValue);
  if (!Number.isInteger(numericValue)) return null;
  if (numericValue === currentValue) return "same";
  if (numericValue < currentValue) return "decreased";
  return null;
}

// The one predicate for a value that needs a check: a failure not yet confirmed, a low-accuracy read, or a decreased value.
// The filter and the cell's warning background use the same condition.
export function fieldNeedsReview(
  detail: StudentFieldDetail,
  proposedValue: string,
  confirmed: boolean,
  currentValue?: number | null,
): boolean {
  if (isRecognitionFailure(detail.state) && !confirmed) return true;
  if (detail.state === "recognized" && detail.confidence < LOW_ACCURACY_THRESHOLD) return true;
  return getFieldComparison(detail, proposedValue, currentValue, confirmed) === "decreased";
}

function studentNeedsReview(
  student: StudentGrowthStudent,
  state: ReviewStudent,
  currentState?: CurrentStudentState,
): boolean {
  return fields.some(({ resultKey, applyKey }) => {
    return fieldNeedsReview(
      student.fieldDetails[resultKey],
      state.values[applyKey],
      state.confirmed[applyKey],
      currentState?.[applyKey],
    );
  });
}

function fieldFailureReason(state: StudentVideoFieldState): string {
  return state === "conflict" ? "서로 다른 화면에서 값이 다르게 인식됨" : "인식값을 확인하지 못함";
}

export function createReviewState(result: StudentGrowthResult): ReviewState {
  return Object.fromEntries(
    result.students.map((student) => [
      student.studentUid,
      {
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
  result: StudentGrowthResult,
  review: ReviewState,
  validStudentUids?: ReadonlySet<string>,
  excludedStudentUids?: ReadonlySet<string>,
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
      if (
        !state?.confirmed.tier ||
        (validStudentUids && !validStudentUids.has(student.studentUid)) ||
        excludedStudentUids?.has(student.studentUid)
      ) {
        return [];
      }
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

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}
