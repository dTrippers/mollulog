import { ExclamationTriangleIcon, FunnelIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router";
import { StudentCard, TierSelector } from "~/components/features/students";
import {
  Button,
  Callout,
  HoverTooltip,
  NumberInput,
  type NumberInputFlowNavigationInputProps,
  SubTitle,
  useNumberInputFlowNavigation,
} from "~/components/primitives";
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
import type { ScannerOutletContext } from "../scanner";
import ScannerCompletionState from "../scanner._components/ScannerCompletionState";
import ScannerFileList from "../scanner._components/ScannerFileList";
import ScannerImageDialog from "../scanner._components/ScannerImageDialog";
import ScannerJobShell from "../scanner._components/ScannerJobShell";
import ScannerJobSkeleton from "../scanner._components/ScannerJobSkeleton";
import { notifyScannerJobsChanged } from "../scanner._components/ScannerJobsPanel";
import ScannerProgressCard from "../scanner._components/ScannerProgressCard";
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
  getScannerTerminalJobDescription,
  getScannerTerminalJobTitle,
  getScannerUnavailableResultMessage,
  scannerMessages,
} from "../scanner._components/scanner-messages";
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
  label: "공격",
  min: 0,
  max: 25,
} as const;
const abilityHealField = {
  resultKey: "abilityHeal",
  applyKey: "abilityHeal",
  label: "치유",
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
const BASIC_GROUP_GRID = "grid-cols-[10rem_repeat(3,minmax(0,1fr))]";

type CurrentStudentState = Partial<Record<ApplyFieldName, number | null>> & {
  studentUid: string;
};

type JobApplication = { status: string; appliedAt: string | null } | null;

type StudentGrowthResult = StudentDetailVideoResult | StudentDetailImagesResult;
type StudentGrowthStudent = StudentDetailVideoResult["students"][number] | StudentDetailImageStudent;
type StudentFieldDetail = StudentGrowthStudent["fieldDetails"][StudentVideoFieldName];

type StudentVideoJob = {
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
  artifacts: Array<{
    uid: string;
    studentUid: string;
    sourceFrame: number;
    timestampSeconds: number;
  }>;
  currentStudentStates?: Record<string, CurrentStudentState>;
  studentCatalog?: Record<string, { uid: string; name: string; initialTier: number }>;
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
    return `${failedImages.map((image) => image.filename).join(", ")} · 성공한 이미지의 결과만 검토할 수 있어요.`;
  }

  const descriptions = [
    `${oversizedImages.map((image) => image.filename).join(", ")} · ${STUDENT_IMAGE_DIMENSIONS_EXCEEDED_MESSAGE}`,
  ];
  const otherFailedImages = failedImages.filter(
    (image) => image.error?.code !== STUDENT_IMAGE_DIMENSIONS_EXCEEDED_CODE,
  );
  if (otherFailedImages.length > 0) {
    descriptions.push(`${otherFailedImages.map((image) => image.filename).join(", ")} · 이미지를 인식하지 못했어요`);
  }
  return `${descriptions.join(" ")} 성공한 이미지의 결과만 검토할 수 있어요.`;
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
      updateJob((currentJob) => (currentJob ? { ...currentJob, application: response.application } : null));
      setPhase("applied");
      notifyScannerJobsChanged();
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

  const uploadContent = !selectedJobUid ? (
    <ScannerUploadSection
      title="학생 성장도 파일 업로드"
      description="학생 성장도 정보를 확인할 수 있는 이미지 또는 영상을 업로드해주세요."
      descriptionLines={[
        "이미지: 게임 내 [학생] 메뉴에서 학생을 한 명 선택하여 [기본 정보] 화면을 띄운 뒤 스크린샷을 찍어주세요.",
        "영상: 같은 화면에서 좌/우 화살표로 이동하는 과정을 녹화해주세요.",
      ]}
      inputId="student-scanner-files"
      accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,.png,.jpg,.jpeg,.webp,.mp4,.mov"
      multiple
      selectionDisabled={phase !== "idle" || (imageUploadQuota?.remaining === 0 && uploadQuota?.remaining === 0)}
      onFiles={selectFiles}
      icon={<PhotoIcon className="size-6" aria-hidden="true" />}
      targetGuide={selectedFiles.length === 0 ? <ScannerUploadTargetGuide target="student" /> : undefined}
      helpText="1회당 최대 이미지 30장 또는 영상 1개"
      dropDetail={
        selectedFiles.length > 0 ? (
          <span className="mt-2 flex max-w-full flex-col items-center gap-1.5 text-xs text-muted-foreground">
            <span>
              {selectedUpload.images.length > 0
                ? `이미지 ${selectedUpload.images.length}장 · ${formatScannerBytes(selectedImageBytes)}`
                : ""}
              {selectedUpload.video ? ` · 영상 ${formatScannerBytes(selectedUpload.video.size)}` : ""}
              {phase === "uploading"
                ? hashProgress < 1
                  ? ` · 파일 확인 ${Math.round(hashProgress * 100)}%`
                  : ` · 업로드 ${Math.round(uploadProgress * 100)}%`
                : ""}
            </span>
            {phase === "uploading" ? (
              <progress
                aria-label={hashProgress < 1 ? "학생 이미지·영상 파일 확인 진행률" : "학생 이미지·영상 업로드 진행률"}
                className="h-1.5 w-40 accent-primary"
                max={1}
                value={hashProgress < 1 ? hashProgress : uploadProgress}
              />
            ) : null}
          </span>
        ) : null
      }
      consentChecked={allowsTrainingDataUse}
      consentDisabled={phase !== "idle"}
      onConsentChange={setAllowsTrainingDataUse}
      actionDisabled={uploadActionDisabled}
      actionLabel={
        phase === "uploading"
          ? hashProgress < 1
            ? "파일 확인 중..."
            : `업로드 ${Math.round(uploadProgress * 100)}%`
          : "인식 시작"
      }
      onAction={startRecognition}
    >
      <ScannerFileList
        files={selectedFiles}
        disabled={phase !== "idle"}
        onRemove={(index) => {
          if (phase !== "idle") return;
          setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
          setError(null);
        }}
      />
      {selectedFiles.length > 0 ? (
        <div className="flex justify-end">
          <Button size="sm" disabled={phase !== "idle"} onClick={clearSelectedFiles}>
            선택 초기화
          </Button>
        </div>
      ) : null}
    </ScannerUploadSection>
  ) : null;

  const progressContent =
    phase === "waiting" && job ? (
      <ScannerProgressCard
        title="학생 성장도를 인식하고 있어요"
        description="이미지 또는 영상에서 학생 정보를 읽고 있어요. 화면을 벗어나도 인식은 계속 진행돼요."
        progress={job.progress}
        segmentStatuses={[
          ...job.images.map((image) => ({ key: image.uid, status: image.status })),
          ...(job.video ? [{ key: `video:${job.video.inputUid}`, status: job.video.status }] : []),
        ]}
        segmentLabel="파일 처리"
        remainingLabel="{remaining}개 남았어요"
        etaLabel="파일 종류와 수에 따라 시간이 달라질 수 있어요."
      />
    ) : null;

  const reviewContent =
    job?.status === "review_ready" && job.result ? (
      <ReviewPanel
        key={job.uid}
        job={{ ...job, result: job.result }}
        review={review}
        excludedStudentUids={excludedStudentUids}
        phase={phase}
        onReviewChange={setReview}
        onExcludeStudent={(studentUid) =>
          setExcludedStudentUids((current) => {
            const next = new Set(current);
            next.add(studentUid);
            return next;
          })
        }
        onApply={applyReview}
        onCancel={cancelResult}
        onStartNew={() => resetForNewUpload()}
        isCancelling={isCancelling}
        error={error}
        partialFailure={selectedPartialFailure}
      />
    ) : null;

  const completionContent = (
    <>
      {job?.status === "review_ready" && !job.result ? (
        <ScannerCompletionState
          tone="destructive"
          title="학생 인식 결과를 확인하지 못했어요"
          description={getScannerUnavailableResultMessage()}
          actionLabel={scannerMessages.student.uploadAction}
          onStartNew={() => resetForNewUpload()}
        />
      ) : null}

      {job &&
      selectedJobUid &&
      phase === "idle" &&
      error &&
      !TERMINAL_JOB_STATUSES.has(job.status) &&
      !(job.status === "review_ready" && !job.result) ? (
        <ScannerCompletionState
          tone="destructive"
          title="인식 작업 상태를 확인하지 못했어요"
          description={error}
          actionLabel={scannerMessages.student.uploadAction}
          onStartNew={() => resetForNewUpload(false)}
        />
      ) : null}

      {job?.status === "review_ready" && job.application?.status === "applied" ? (
        <ScannerCompletionState
          title="학생 성장도 반영이 완료됐어요"
          description="새로운 인식을 시작하려면 아래 버튼을 눌러주세요."
          actionLabel={scannerMessages.student.uploadAction}
          onStartNew={() => resetForNewUpload()}
        />
      ) : null}

      {job && TERMINAL_JOB_STATUSES.has(job.status) ? (
        <ScannerCompletionState
          tone="destructive"
          title={getScannerTerminalJobTitle(job.status, job.jobKind)}
          description={getScannerTerminalJobDescription(job.status, job.jobKind, job.images)}
          actionLabel={scannerMessages.student.uploadAction}
          onStartNew={() => resetForNewUpload()}
        />
      ) : null}
    </>
  );

  return (
    <div className="space-y-8 pb-12 pt-6 lg:pt-2">
      {error && phase !== "review" && phase !== "applying" && !(selectedJobUid && job && phase === "idle") ? (
        <Callout tone="destructive">{error}</Callout>
      ) : selectedPartialFailure && phase !== "review" && phase !== "applying" ? (
        <Callout tone="warning" title="일부 파일만 제출됐어요">
          {selectedPartialFailure}
        </Callout>
      ) : null}
      {selectedQuotaError && !error ? <Callout tone="warning">{selectedQuotaError}</Callout> : null}
      {selectedJobUid && !job ? <ScannerJobSkeleton variant="student" /> : null}
      <ScannerJobShell
        phase={phase}
        upload={uploadContent}
        progress={progressContent}
        review={reviewContent}
        completion={completionContent}
      />
    </div>
  );
}

function ReviewPanel({
  job,
  review,
  excludedStudentUids,
  phase,
  onReviewChange,
  onExcludeStudent,
  onApply,
  onCancel,
  onStartNew,
  isCancelling,
  error,
  partialFailure,
}: {
  job: StudentVideoJob & { result: StudentGrowthResult };
  review: ReviewState;
  excludedStudentUids: ReadonlySet<string>;
  phase: ScannerPhase;
  onReviewChange: React.Dispatch<React.SetStateAction<ReviewState>>;
  onExcludeStudent: (studentUid: string) => void;
  onApply: (remainingReviewStudentCount: number, excludedStudentUids: ReadonlySet<string>) => void;
  onCancel: () => void;
  onStartNew: () => void;
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
  const reviewDescription =
    remainingReviewStudents.length > 0
      ? `${job.result.students.length}명 인식 · ${remainingReviewStudents.length}명 검토 필요`
      : `${job.result.students.length}명 인식 · 검토 완료`;
  const showReviewRequiredOnly = reviewFilterStudentUids !== null;
  const visibleStudents = showReviewRequiredOnly
    ? activeStudents.filter(({ studentUid }) => reviewFilterStudentUids.includes(studentUid))
    : activeStudents;

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
    const currentIndex = visibleStudents.findIndex((student) => student.studentUid === studentUid);
    const nextFocusStudentUid =
      visibleStudents[currentIndex + 1]?.studentUid ?? visibleStudents[currentIndex - 1]?.studentUid ?? null;
    setPendingFocusTarget(
      nextFocusStudentUid === null ? { kind: "action-bar" } : { kind: "student", studentUid: nextFocusStudentUid },
    );
    setExclusionAnnouncement(`${studentName} 학생을 저장 대상에서 제외했어요.`);
    onExcludeStudent(studentUid);
  };

  return (
    <section className="space-y-4">
      {exclusionAnnouncement ? (
        <p role="status" aria-live="polite" className="sr-only">
          {exclusionAnnouncement}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <SubTitle text="인식 결과 검토" description={reviewDescription} />
        </div>
        <div className="flex w-full min-w-0 flex-wrap justify-end gap-2 sm:w-auto">
          <Button size="sm" onClick={onStartNew}>
            {scannerMessages.student.uploadAction}
          </Button>
          <Button
            size="sm"
            variant={showReviewRequiredOnly ? "inverse" : "default"}
            pressed={showReviewRequiredOnly}
            className="gap-1.5"
            onClick={() =>
              setReviewFilterStudentUids((current) =>
                current === null ? remainingReviewStudents.map(({ studentUid }) => studentUid) : null,
              )
            }
          >
            <FunnelIcon className="size-4 shrink-0" aria-hidden="true" />
            <span>검토가 필요한 데이터만 보기</span>
          </Button>
        </div>
      </div>

      {error || partialFailure || failedImages.length > 0 ? (
        <div role="alert" className="space-y-1 text-sm text-destructive">
          {error ? <p>{error}</p> : null}
          {partialFailure ? <p>{partialFailure}</p> : null}
          {failedImages.length > 0 ? (
            <p>
              <span className="font-semibold">일부 이미지를 인식하지 못했어요.</span>{" "}
              {getStudentFailedImagesDescription(failedImages)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="max-h-[70vh] max-w-full overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[64rem] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-24" />
            <col className="w-[20.5rem]" />
            <col className="w-56" />
            <col className="w-56" />
            <col className="w-[10.5rem]" />
          </colgroup>
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th
                scope="col"
                className="sticky top-0 left-0 z-30 w-24 bg-muted/95 px-1 py-2 text-center font-semibold backdrop-blur-sm"
              >
                학생
              </th>
              <ReviewGroupHeader
                label="기본 정보"
                fields={[tierField, ...basicNumberFields]}
                gridClass={BASIC_GROUP_GRID}
              />
              <ReviewGroupHeader label="스킬" fields={skillFields} />
              <ReviewGroupHeader label="장비" fields={equipmentFields} />
              <ReviewGroupHeader label="능력 해방" fields={abilityFields} />
            </tr>
          </thead>
          <tbody>
            {visibleStudents.map((student) => {
              const state = review[student.studentUid];
              const catalogStudent = job.studentCatalog?.[student.studentUid];
              const studentName = catalogStudent?.name ?? student.studentName;
              const artifact = artifactsByStudentUid.get(student.studentUid);
              if (!state) return null;
              const reviewIssueCount = fields.filter(({ resultKey, applyKey }) => {
                const detail = student.fieldDetails[resultKey];
                return fieldNeedsReview(
                  detail,
                  state.values[applyKey],
                  state.confirmed[applyKey],
                  job.currentStudentStates?.[student.studentUid]?.[applyKey],
                );
              }).length;
              const updateValue = (field: ApplyFieldName, value: number | null) =>
                updateStudent(student.studentUid, (current) => ({
                  ...current,
                  confirmed: { ...current.confirmed, [field]: value !== null },
                  values: { ...current.values, [field]: value === null ? "" : String(value) },
                }));

              return (
                <tr
                  key={student.studentUid}
                  className={cn(
                    "border-b border-border align-middle last:border-b-0",
                    !catalogStudent && "bg-muted/30",
                  )}
                >
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 z-10 w-24 bg-card px-1 py-1.5 font-medium",
                      !catalogStudent && "bg-muted",
                    )}
                  >
                    <div className="flex min-w-0 items-stretch justify-between gap-1">
                      <div className="relative w-11 shrink-0">
                        <StudentCard
                          uid={catalogStudent?.uid ?? null}
                          name={studentName}
                          nameSize="small"
                          namePlacement="overlay"
                          flush
                        />
                        {reviewIssueCount > 0 ? (
                          <span
                            title={`${reviewIssueCount}개 확인 필요`}
                            className="absolute -top-1.5 -right-1.5 z-10 inline-flex size-6 items-center justify-center rounded-full border border-amber-500/50 bg-card/95 text-amber-500 shadow-sm shadow-black/25 backdrop-blur-sm dark:border-amber-400/40 dark:bg-muted/95 dark:text-amber-300"
                          >
                            <ExclamationTriangleIcon className="size-4" strokeWidth={2.25} aria-hidden="true" />
                            <span className="sr-only">{reviewIssueCount}개 확인 필요</span>
                          </span>
                        ) : null}
                        {!catalogStudent ? (
                          <span className="mt-1 block whitespace-nowrap text-center text-xs font-semibold leading-none text-destructive">
                            반영 불가
                          </span>
                        ) : null}
                      </div>
                      <div className="flex w-10 shrink-0 flex-col justify-center gap-1">
                        {artifact ? (
                          <HoverTooltip as="div" className="w-full" content="인식 화면 보기">
                            <Button
                              size="xs"
                              fullWidth
                              onClick={() =>
                                setSelectedPreview({
                                  artifact,
                                  studentName,
                                })
                              }
                              className="px-1"
                            >
                              <span aria-hidden="true">보기</span>
                              <span className="sr-only">{studentName} 인식 화면 보기</span>
                            </Button>
                          </HoverTooltip>
                        ) : null}
                        <div
                          className="w-full"
                          ref={(element) => {
                            if (!element) {
                              excludeButtonRefs.current.delete(student.studentUid);
                              return;
                            }
                            const button = element.querySelector<HTMLButtonElement>("button");
                            if (button) excludeButtonRefs.current.set(student.studentUid, button);
                          }}
                        >
                          <Button
                            size="xs"
                            fullWidth
                            variant="danger-subtle"
                            className="px-1"
                            disabled={phase === "applying" || isCancelling}
                            onClick={() => excludeStudent(student.studentUid, studentName)}
                          >
                            <span aria-hidden="true">제외</span>
                            <span className="sr-only">{studentName} 학생을 저장 대상에서 제외</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </th>
                  <td className="border-l border-border px-1 py-1.5 align-top">
                    <ReviewBasicGroup
                      studentName={studentName}
                      initialTier={catalogStudent?.initialTier ?? tierField.min}
                      student={student}
                      state={state}
                      currentState={job.currentStudentStates?.[student.studentUid]}
                      disabled={!catalogStudent}
                      getInputProps={numberInputNavigation.getInputProps}
                      onValueChange={updateValue}
                    />
                  </td>
                  <ReviewNumberGroup
                    studentName={studentName}
                    student={student}
                    state={state}
                    currentState={job.currentStudentStates?.[student.studentUid]}
                    fields={skillFields}
                    disabled={!catalogStudent}
                    getInputProps={numberInputNavigation.getInputProps}
                    onValueChange={updateValue}
                  />
                  <ReviewNumberGroup
                    studentName={studentName}
                    student={student}
                    state={state}
                    currentState={job.currentStudentStates?.[student.studentUid]}
                    fields={equipmentFields}
                    disabled={!catalogStudent}
                    getInputProps={numberInputNavigation.getInputProps}
                    onValueChange={updateValue}
                  />
                  <ReviewNumberGroup
                    studentName={studentName}
                    student={student}
                    state={state}
                    currentState={job.currentStudentStates?.[student.studentUid]}
                    fields={abilityFields}
                    disabled={!catalogStudent}
                    getInputProps={numberInputNavigation.getInputProps}
                    onValueChange={updateValue}
                  />
                </tr>
              );
            })}
            {visibleStudents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {showReviewRequiredOnly ? "검토가 필요한 데이터가 없습니다." : "저장할 학생이 없습니다."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div ref={actionBarRef} className="flex flex-wrap justify-end gap-2">
        <Button variant="danger-subtle" disabled={phase === "applying" || isCancelling} onClick={onCancel}>
          {isCancelling ? "취소 중..." : "인식 결과 삭제"}
        </Button>
        <Button
          variant="primary"
          disabled={phase === "applying" || isCancelling || saveableStudentCount === 0}
          onClick={() => onApply(remainingReviewStudents.length, excludedStudentUids)}
        >
          {phase === "applying" ? "반영 중..." : "성장도 저장"}
        </Button>
      </div>
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
    </section>
  );
}

function ReviewGroupHeader({
  label,
  fields: groupFields,
  gridClass,
}: {
  label: string;
  fields: readonly FieldDefinition[];
  gridClass?: string;
}) {
  const resolvedGridClass = gridClass ?? (groupFields.length === 3 ? "grid-cols-3" : "grid-cols-4");

  return (
    <th
      scope="col"
      className="sticky top-0 z-20 border-l border-border bg-muted/95 px-2 py-2 text-center font-semibold backdrop-blur-sm"
    >
      <span>{label}</span>
      <span className={cn("mt-1 grid font-medium", resolvedGridClass)}>
        {groupFields.map(({ resultKey, label: fieldLabel }) => (
          <span key={resultKey} className="min-w-0 text-center">
            {fieldLabel}
          </span>
        ))}
      </span>
    </th>
  );
}

function ReviewBasicGroup({
  studentName,
  initialTier,
  student,
  state,
  currentState,
  disabled,
  getInputProps,
  onValueChange,
}: ReviewGroupProps & { initialTier: number }) {
  const tierDetail = student.fieldDetails.tier;
  const tierRecognized = tierDetail.state === "recognized";
  const tierEditable = tierRecognized || isRecognitionFailure(tierDetail.state);
  const tierValue = state.values.tier === "" ? null : Number(state.values.tier);
  const tierNeedsWarning = tierRecognized && tierDetail.confidence < LOW_ACCURACY_THRESHOLD;
  const tierFailed = isRecognitionFailure(tierDetail.state);
  const tierFailureUnresolved = tierFailed && !state.confirmed.tier;
  const tierComparison = getFieldComparison(tierDetail, state.values.tier, currentState?.tier, state.confirmed.tier);
  const tierUnchanged = tierComparison === "same";
  const tierDecreased = tierComparison === "decreased";

  return (
    <div>
      <div className={cn("grid overflow-hidden rounded-md border border-input bg-background", BASIC_GROUP_GRID)}>
        <HoverTooltip
          as="div"
          content={`인식 정확도 ${formatConfidence(tierDetail.state === "recognized" ? tierDetail.confidence : 0)}`}
          disabled={!tierNeedsWarning}
          className={cn(
            "flex min-w-0 items-center justify-center px-1",
            tierNeedsWarning && "cursor-help",
            tierNeedsWarning && "bg-amber-50 dark:bg-amber-500/10",
            tierFailureUnresolved && "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
            tierUnchanged && "bg-muted/40",
            tierDecreased && "bg-red-50 dark:bg-red-500/10",
            !tierRecognized && !tierFailed && "bg-muted/50",
          )}
        >
          {tierEditable ? (
            <div
              className={cn(
                disabled && "pointer-events-none opacity-60",
                tierUnchanged && "opacity-60",
                tierDecreased && "[&_svg]:!text-red-600 dark:[&_svg]:!text-red-300",
              )}
            >
              <TierSelector
                initialTier={initialTier}
                currentTier={tierValue}
                iconSize="sm"
                disabled={disabled}
                onTierChange={(tier) => {
                  onValueChange("tier", tier);
                }}
              />
            </div>
          ) : (
            <UnavailableFieldValue state={tierDetail.state} />
          )}
        </HoverTooltip>
        {basicNumberFields.map((field) => (
          <ReviewNumberInput
            key={field.resultKey}
            studentName={studentName}
            field={field}
            detail={student.fieldDetails[field.resultKey]}
            value={state.values[field.applyKey]}
            currentValue={currentState?.[field.applyKey]}
            disabled={disabled}
            inputProps={getInputProps({ disabled })}
            onValueChange={onValueChange}
          />
        ))}
      </div>
      <div className={cn("mt-1 grid", BASIC_GROUP_GRID)}>
        <ReviewFieldMeta
          detail={tierDetail}
          proposedValue={state.values.tier}
          currentValue={currentState?.tier ?? null}
          confirmed={state.confirmed.tier}
          tier
        />
        {basicNumberFields.map((field) => (
          <ReviewFieldMeta
            key={field.resultKey}
            detail={student.fieldDetails[field.resultKey]}
            proposedValue={state.values[field.applyKey]}
            currentValue={currentState?.[field.applyKey] ?? null}
            confirmed={state.confirmed[field.applyKey]}
          />
        ))}
      </div>
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
};

function ReviewNumberGroup({
  studentName,
  student,
  state,
  currentState,
  fields: groupFields,
  disabled,
  getInputProps,
  onValueChange,
}: ReviewGroupProps & { fields: readonly FieldDefinition[] }) {
  const gridClass = groupFields.length === 3 ? "grid-cols-3" : "grid-cols-4";

  return (
    <td className="border-l border-border px-1 py-1.5 align-top">
      <div>
        <div className={cn("grid overflow-hidden rounded-md border border-input bg-background", gridClass)}>
          {groupFields.map((field) => (
            <ReviewNumberInput
              key={field.resultKey}
              studentName={studentName}
              field={field}
              detail={student.fieldDetails[field.resultKey]}
              value={state.values[field.applyKey]}
              currentValue={currentState?.[field.applyKey]}
              disabled={disabled}
              inputProps={getInputProps({ disabled })}
              onValueChange={onValueChange}
            />
          ))}
        </div>
        <div className={cn("mt-1 grid", gridClass)}>
          {groupFields.map((field) => {
            const detail = student.fieldDetails[field.resultKey];
            return (
              <ReviewFieldMeta
                key={field.resultKey}
                detail={detail}
                proposedValue={state.values[field.applyKey]}
                currentValue={currentState?.[field.applyKey] ?? null}
                confirmed={state.confirmed[field.applyKey]}
              />
            );
          })}
        </div>
      </div>
    </td>
  );
}

function ReviewNumberInput({
  studentName,
  field,
  detail,
  value,
  currentValue,
  disabled,
  inputProps,
  onValueChange,
}: {
  studentName: string;
  field: FieldDefinition;
  detail: StudentFieldDetail;
  value: string;
  currentValue?: number | null;
  disabled: boolean;
  inputProps: NumberInputFlowNavigationInputProps;
  onValueChange: (field: ApplyFieldName, value: number | null) => void;
}) {
  const recognized = detail.state === "recognized";
  const needsWarning = recognized && detail.confidence < LOW_ACCURACY_THRESHOLD;
  const failed = isRecognitionFailure(detail.state);
  const confirmed = recognized || value !== "";
  const unresolvedFailure = failed && !confirmed;
  const comparison = getFieldComparison(detail, value, currentValue, confirmed);
  const unchanged = comparison === "same";
  const decreased = comparison === "decreased";

  return (
    <HoverTooltip
      as="div"
      content={`인식 정확도 ${formatConfidence(recognized ? detail.confidence : 0)}`}
      disabled={!needsWarning}
      className={cn(
        "min-w-0 border-l border-input first:border-l-0",
        needsWarning && "cursor-help",
        needsWarning && "bg-amber-50 dark:bg-amber-500/10",
        unresolvedFailure && "bg-red-50 dark:bg-red-500/10",
        unchanged && "bg-muted/40",
        decreased && "bg-red-50 dark:bg-red-500/10",
        !recognized && !failed && "bg-muted/50",
      )}
    >
      {recognized ? (
        <NumberInput
          value={Number(value)}
          minValue={field.min}
          maxValue={field.max}
          showDecrease={false}
          showIncrease={false}
          fullWidth
          disabled={disabled}
          controlClassName="max-w-none rounded-none border-0 bg-transparent focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring/40"
          inputProps={{
            ...inputProps,
            "aria-label": `${studentName} ${field.label} 인식 결과`,
            className: cn(
              "h-6 px-1 py-0 text-sm font-normal tabular-nums",
              unchanged && "text-muted-foreground/50",
              decreased && "text-red-700 dark:text-red-300",
            ),
          }}
          onChange={(nextValue) => onValueChange(field.applyKey, nextValue)}
        />
      ) : failed ? (
        <NumberInput
          nullable
          value={value === "" ? null : Number(value)}
          minValue={field.min}
          maxValue={field.max}
          showDecrease={false}
          showIncrease={false}
          fullWidth
          disabled={disabled}
          controlClassName="max-w-none rounded-none border-0 bg-transparent focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring/40"
          inputProps={{
            ...inputProps,
            "aria-label": `${studentName} ${field.label} 인식 결과 직접 입력`,
            className: cn(
              "h-6 px-1 py-0 text-sm font-normal tabular-nums",
              unchanged && "text-muted-foreground/50",
              decreased && "text-red-700 dark:text-red-300",
            ),
          }}
          onChange={(nextValue) => onValueChange(field.applyKey, nextValue)}
        />
      ) : (
        <div className="flex h-6 items-center justify-center text-sm font-normal text-muted-foreground">
          <UnavailableFieldValue state={detail.state} />
        </div>
      )}
    </HoverTooltip>
  );
}

function ReviewFieldMeta({
  detail,
  proposedValue,
  currentValue,
  confirmed,
  tier = false,
}: {
  detail: StudentFieldDetail;
  proposedValue: string;
  currentValue: number | null;
  confirmed: boolean;
  tier?: boolean;
}) {
  const failed = isRecognitionFailure(detail.state);
  const comparison = getFieldComparison(detail, proposedValue, currentValue, confirmed);
  if (currentValue === null && detail.state === "recognized") {
    return <span aria-hidden="true" />;
  }

  return (
    <span
      className={cn(
        "flex min-w-0 flex-col items-center px-0.5 text-center text-xs leading-3 text-muted-foreground",
        comparison === "same" && "opacity-50",
        comparison === "decreased" && "text-red-700 dark:text-red-300",
      )}
    >
      {currentValue !== null ? (
        <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
          현재 {tier ? <GrowthTier tier={currentValue} /> : currentValue}
        </span>
      ) : null}
      {failed && !confirmed ? (
        <HoverTooltip
          content={fieldFailureReason(detail.state)}
          focusable
          className="cursor-help whitespace-nowrap rounded-sm font-medium text-red-700 outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-red-300"
        >
          인식 실패
        </HoverTooltip>
      ) : failed ? (
        <span className="whitespace-nowrap">직접 입력</span>
      ) : detail.state === "not_applicable" ? (
        <span className="inline-flex items-center gap-0.5 whitespace-nowrap">{fieldStateLabel(detail.state)}</span>
      ) : null}
    </span>
  );
}

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
    not_applicable: "—",
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

function fieldNeedsReview(
  detail: StudentFieldDetail,
  proposedValue: string,
  confirmed: boolean,
  currentValue?: number | null,
): boolean {
  if (isRecognitionFailure(detail.state) && !confirmed) return true;
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

function fieldStateLabel(state: StudentVideoFieldState): string {
  return {
    recognized: "정확도",
    not_applicable: "미장착",
    unknown: "인식 실패",
    conflict: "인식 실패",
  }[state];
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}
