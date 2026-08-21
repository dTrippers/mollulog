import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  PhotoIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router";
import { StudentCard, TierSelector } from "~/components/features/students";
import {
  Button,
  Callout,
  FloatingActionBar,
  HoverTooltip,
  NumberInput,
  type NumberInputFlowNavigationInputProps,
  SectionCard,
  SubTitle,
  useNumberInputFlowNavigation,
} from "~/components/primitives";
import {
  OCR_ALLOWED_CONTENT_TYPES,
  OCR_MAX_IMAGE_BYTES,
  OCR_MAX_IMAGES,
  OCR_MAX_JOB_BYTES,
  OCR_MAX_VIDEO_BYTES,
  type OcrUploadInput,
  type OcrVideoUploadInput,
} from "~/domain/ocr";
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
import ScannerJobSkeleton from "../scanner._components/ScannerJobSkeleton";
import { notifyScannerJobsChanged } from "../scanner._components/ScannerJobsPanel";
import ScannerUploadSection from "../scanner._components/ScannerUploadSection";
import {
  formatScannerBytes,
  requestScannerJson,
  ScannerApiRequestError,
  type ScannerPhase,
  toScannerErrorMessage,
  uploadScannerFile,
} from "../scanner._components/scanner-client";
import { sha256FileInWorker } from "../scanner._components/sha256-client";
import type { ScannerUploadQuota } from "../scanner._components/UploadQuotaMeter";

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

export type StudentUploadSelection = {
  images: File[];
  video: File | null;
};

type StudentUploadValidation = StudentUploadSelection & {
  error: string | null;
};

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
type FieldComparison = "same" | "decreased" | null;

const IMAGE_FILE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const VIDEO_FILE_EXTENSIONS = new Set(["mp4", "mov"]);
const STUDENT_UPLOAD_CONFLICT_ERROR = "파일의 MIME 타입과 확장자가 일치하지 않아요. 파일을 확인해 주세요.";
const STUDENT_UPLOAD_HASH_ERROR = "파일 정보를 계산하지 못했어요";
const STUDENT_UPLOAD_UPLOAD_ERROR = "파일 업로드에 실패했어요. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
const STUDENT_UPLOAD_GENERIC_FAILURE_REASON = "파일 제출을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";

type StudentUploadMediaKind = "image" | "video";

function getFileExtension(file: File): string | null {
  return file.name.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? null;
}

function getMimeMediaKind(file: File): StudentUploadMediaKind | null {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

function getExtensionMediaKind(file: File): StudentUploadMediaKind | null {
  const extension = getFileExtension(file);
  if (extension && IMAGE_FILE_EXTENSIONS.has(extension)) return "image";
  if (extension && VIDEO_FILE_EXTENSIONS.has(extension)) return "video";
  return null;
}

function hasContradictoryMediaEvidence(file: File): boolean {
  const mimeKind = getMimeMediaKind(file);
  const extensionKind = getExtensionMediaKind(file);
  return mimeKind !== null && extensionKind !== null && mimeKind !== extensionKind;
}

function getVideoContentType(file: File): OcrVideoUploadInput["contentType"] | null {
  const mimeType = file.type.toLowerCase();
  if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
    return mimeType as OcrVideoUploadInput["contentType"];
  }
  if (getMimeMediaKind(file) !== null) return null;
  const extension = getFileExtension(file);
  if (extension === "mp4") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  return null;
}

function getImageContentType(file: File): OcrUploadInput["contentType"] | null {
  const mimeType = file.type.toLowerCase();
  if (OCR_ALLOWED_CONTENT_TYPES.includes(mimeType as OcrUploadInput["contentType"])) {
    return mimeType as OcrUploadInput["contentType"];
  }
  if (getMimeMediaKind(file) !== null) return null;
  const extension = getFileExtension(file);
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return null;
}

export function classifyStudentUploadFiles(files: ReadonlyArray<File>): StudentUploadValidation {
  const images: File[] = [];
  let video: File | null = null;

  for (const file of files) {
    if (hasContradictoryMediaEvidence(file)) {
      return { images: [], video: null, error: STUDENT_UPLOAD_CONFLICT_ERROR };
    }
    if (getImageContentType(file)) {
      images.push(file);
      continue;
    }
    if (getVideoContentType(file)) {
      if (video) {
        return { images: [], video: null, error: "영상은 한 번에 한 개만 선택할 수 있어요." };
      }
      video = file;
      continue;
    }
    return {
      images: [],
      video: null,
      error: "지원하는 파일은 PNG, JPEG, WebP 이미지와 MP4, MOV 영상이에요.",
    };
  }

  if (images.length > OCR_MAX_IMAGES) {
    return { images: [], video: null, error: `이미지는 1장부터 ${OCR_MAX_IMAGES}장까지 선택할 수 있어요.` };
  }

  const totalImageBytes = images.reduce((sum, image) => sum + image.size, 0);
  if (totalImageBytes > OCR_MAX_JOB_BYTES) {
    return { images: [], video: null, error: "한 작업의 이미지 전체 용량은 120MB를 넘을 수 없어요." };
  }

  if (images.some((image) => image.size <= 0 || image.size > OCR_MAX_IMAGE_BYTES)) {
    return { images: [], video: null, error: "이미지 한 장은 10MB를 넘을 수 없어요." };
  }

  if (video && (video.size <= 0 || video.size > OCR_MAX_VIDEO_BYTES)) {
    return { images: [], video: null, error: "영상은 250MB를 넘을 수 없어요." };
  }

  return { images, video, error: null };
}

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
      for (const [index, file] of files.entries()) {
        const contentType = kind === "image" ? getImageContentType(file) : getVideoContentType(file);
        if (!contentType) throw new Error("지원하는 파일은 PNG, JPEG, WebP 이미지와 MP4, MOV 영상이에요.");
        const key = `${kind}:${index}`;
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

function getStudentTerminalJobTitle(status: string, jobKind: StudentVideoJob["jobKind"]): string {
  if (status === "cancelled") return "학생 성장도 인식 작업이 취소됐어요";
  if (status === "expired") return "학생 성장도 인식 작업이 만료됐어요";
  return jobKind === "student_detail_images_v1" ? "학생 이미지를 인식하지 못했어요" : "학생 영상을 인식하지 못했어요";
}

export function getStudentTerminalJobDescription(
  status: string,
  jobKind: StudentVideoJob["jobKind"],
  images: ReadonlyArray<StudentImageFailure> = [],
): string {
  if (status === "cancelled") return "새 이미지나 영상을 선택해 다시 인식을 시작해 주세요.";
  if (status === "expired") return "보관 기간이 지난 작업이에요. 새 파일을 선택해 다시 시도해 주세요.";
  if (
    jobKind === "student_detail_images_v1" &&
    images.some((image) => image.status === "failed" && image.error?.code === STUDENT_IMAGE_DIMENSIONS_EXCEEDED_CODE)
  ) {
    return STUDENT_IMAGE_DIMENSIONS_EXCEEDED_MESSAGE;
  }
  return jobKind === "student_detail_images_v1"
    ? "학생 상세 화면이 보이는 이미지나 영상을 선택해 다시 시도해 주세요."
    : "학생 기본 정보 화면을 확인할 수 있는 이미지나 영상을 선택해 다시 시도해 주세요.";
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

export default function StudentScanner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    videoUploadQuota: uploadQuota,
    setVideoUploadQuota: setUploadQuota,
    imageUploadQuota,
    setImageUploadQuota,
  } = useOutletContext<ScannerOutletContext>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [allowsTrainingDataUse, setAllowsTrainingDataUse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialFailure, setPartialFailure] = useState<StudentUploadPartialFailure | null>(null);
  const [job, setJob] = useState<StudentVideoJob | null>(null);
  const [review, setReview] = useState<ReviewState>({});
  const [phase, setPhase] = useState<ScannerPhase>("idle");
  const [hashProgress, setHashProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const pollAttemptRef = useRef(0);
  const selectedJobUid = searchParams.get("job");

  const showJob = useCallback((next: StudentVideoJob) => {
    setJob(next);
    if (next.status === "review_ready" && next.result) {
      const isApplied = next.application?.status === "applied";
      setReview(isApplied ? {} : createReviewState(next.result));
      setPhase(isApplied ? "applied" : "review");
      setError(null);
    } else if (["queued", "processing", "finalizing"].includes(next.status)) {
      setPhase("waiting");
      setError(null);
    } else if (TERMINAL_JOB_STATUSES.has(next.status)) {
      setPhase("idle");
      setError(null);
    } else {
      setPhase("idle");
      setError(
        next.jobKind === "student_detail_images_v1"
          ? "인식 작업 상태를 확인하지 못했어요. 새 이미지로 다시 시도해 주세요."
          : "인식 작업 상태를 확인하지 못했어요. 새 영상으로 다시 시도해 주세요.",
      );
    }
  }, []);

  useEffect(() => {
    if (!selectedJobUid) {
      setJob(null);
      setReview({});
      setPhase("idle");
      pollAttemptRef.current = 0;
      return;
    }
    pollAttemptRef.current = 0;
    requestScannerJson<StudentVideoJob>(`/api/ocr/jobs/${selectedJobUid}`)
      .then(showJob)
      .catch((loadError) => {
        setSearchParams({}, { replace: true });
        setError(toScannerErrorMessage(loadError));
      });
  }, [selectedJobUid, setSearchParams, showJob]);

  useEffect(() => {
    if (phase !== "waiting" || !job) return;
    const delay = Math.min(10_000, Math.round(2000 * 1.5 ** pollAttemptRef.current));
    const timeout = window.setTimeout(() => {
      requestScannerJson<StudentVideoJob>(`/api/ocr/jobs/${job.uid}`)
        .then((next) => {
          pollAttemptRef.current += 1;
          showJob(next);
          if (!["queued", "processing", "finalizing"].includes(next.status)) notifyScannerJobsChanged();
        })
        .catch((pollError) => {
          pollAttemptRef.current += 1;
          setError(toScannerErrorMessage(pollError));
          setJob((current) => (current ? { ...current } : current));
        });
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [job, phase, showJob]);

  async function startRecognition() {
    const selection = classifyStudentUploadFiles(selectedFiles);
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

      pollAttemptRef.current = 0;
      showJob(successfulJobs[0]);
      setSearchParams({ job: successfulJobs[0].uid }, { replace: true });
      setAllowsTrainingDataUse(false);
      setPartialFailure(
        failures.length > 0
          ? { jobUid: successfulJobs[0].uid, message: getStudentUploadPartialFailureMessage(failures) }
          : null,
      );
      notifyScannerJobsChanged();
    } catch (uploadError) {
      setPhase("idle");
      setError(toScannerErrorMessage(uploadError));
    }
  }

  async function applyReview(remainingReviewStudentCount: number) {
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
      setJob({ ...job, application: response.application });
      setPhase("applied");
      notifyScannerJobsChanged();
    } catch (applyError) {
      setPhase("review");
      setError(toScannerErrorMessage(applyError));
    }
  }

  function selectFiles(candidates: File[]) {
    if (candidates.length === 0) return;
    const nextFiles = [...selectedFiles, ...candidates];
    const validation = classifyStudentUploadFiles(nextFiles);
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

  function clearSelectedJob(confirmUnappliedResult = false) {
    if (confirmUnappliedResult && !window.confirm("현재 인식 결과를 반영하지 않고 새 파일을 업로드할까요?")) {
      return;
    }
    setSearchParams({}, { replace: true });
    setSelectedFiles([]);
    setJob(null);
    setReview({});
    setHashProgress(0);
    setUploadProgress(0);
    setIsCancelling(false);
    pollAttemptRef.current = 0;
    setError(null);
    setPartialFailure(null);
    setPhase("idle");
  }

  async function cancelResult() {
    if (job?.status !== "review_ready" || isCancelling) return;
    if (!window.confirm("이 인식 결과를 취소할까요? 결과는 반영되지 않고 최근 작업에서 사라집니다.")) {
      return;
    }

    setIsCancelling(true);
    setError(null);
    try {
      await requestScannerJson<{ uid: string; status: "cancelled" }>(`/api/ocr/jobs/${job.uid}/cancel`, {
        method: "POST",
      });
      clearSelectedJob();
      notifyScannerJobsChanged();
    } catch (cancelError) {
      setError(toScannerErrorMessage(cancelError));
    } finally {
      setIsCancelling(false);
    }
  }

  const selectedUpload = classifyStudentUploadFiles(selectedFiles);
  const selectedFileNames = selectedFiles.map((file) => file.name).join(", ");
  const selectedImageBytes = selectedUpload.images.reduce((sum, image) => sum + image.size, 0);
  const selectedSummary = [
    selectedUpload.images.length > 0 ? `이미지 ${selectedUpload.images.length}장` : null,
    selectedUpload.video ? "영상 1개" : null,
  ]
    .filter((value): value is string => value !== null)
    .join(" · ");
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

  return (
    <div className="space-y-8 pb-12 pt-6 lg:pt-2">
      {error ? <Callout tone="destructive">{error}</Callout> : null}
      {selectedPartialFailure ? (
        <Callout tone="warning" title="일부 파일만 제출됐어요">
          {selectedPartialFailure}
        </Callout>
      ) : null}
      {selectedQuotaError ? <Callout tone="warning">{selectedQuotaError}</Callout> : null}

      {!selectedJobUid ? (
        <ScannerUploadSection
          title="학생 성장도 파일 업로드"
          description="게임 내 [학생] 메뉴에서 학생을 선택하여 [기본 정보] 화면을 띄운 후, 스크린샷을 찍거나 좌/우 화살표로 이동하는 화면을 녹화해주세요."
          quota={null}
          quotaUnit=""
          quotaSubject=""
          inputId="student-scanner-files"
          accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,.png,.jpg,.jpeg,.webp,.mp4,.mov"
          multiple
          selectionDisabled={phase !== "idle" || (imageUploadQuota?.remaining === 0 && uploadQuota?.remaining === 0)}
          onFiles={selectFiles}
          icon={<PhotoIcon className="size-6" aria-hidden="true" />}
          helpText="1회당 이미지 최대 30장 · 영상 최대 1개"
          dropDetail={
            selectedFiles.length > 0 ? (
              <span className="mt-2 flex max-w-full flex-col items-center gap-1.5 text-xs text-muted-foreground">
                <span className="max-w-full truncate">{selectedFileNames}</span>
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
                    aria-label={
                      hashProgress < 1 ? "학생 이미지·영상 파일 확인 진행률" : "학생 이미지·영상 업로드 진행률"
                    }
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
          {selectedFiles.length > 0 ? (
            <div className="flex justify-end">
              <Button size="sm" disabled={phase !== "idle"} onClick={clearSelectedFiles}>
                선택 초기화
              </Button>
            </div>
          ) : null}
        </ScannerUploadSection>
      ) : null}

      {selectedJobUid && !job ? <ScannerJobSkeleton variant="student" /> : null}

      {phase === "waiting" && job ? (
        <SectionCard
          title="학생 성장도를 인식하고 있어요"
          description="이미지 또는 영상에서 학생 정보를 읽고 있어요. 화면을 벗어나도 인식은 계속 진행돼요."
        >
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ArrowPathIcon className="size-5 animate-spin" aria-hidden="true" />
            <span>{job.status === "queued" ? "처리 순서를 기다리는 중" : "파일을 분석하고 학생 정보를 읽는 중"}</span>
          </div>
        </SectionCard>
      ) : null}

      {job?.status === "review_ready" && job.result && phase !== "applied" ? (
        <ReviewPanel
          key={job.uid}
          job={{ ...job, result: job.result }}
          review={review}
          phase={phase}
          onReviewChange={setReview}
          onApply={applyReview}
          onCancel={cancelResult}
          onStartNew={() => clearSelectedJob(true)}
          isCancelling={isCancelling}
        />
      ) : null}

      {job?.status === "review_ready" && job.application?.status === "applied" ? (
        <ScannerCompletionState
          title="학생 성장도 반영이 완료됐어요"
          description="새 파일을 업로드하려면 아래 버튼을 눌러주세요."
          actionLabel="새 파일 업로드"
          onStartNew={() => clearSelectedJob()}
        />
      ) : null}

      {job && TERMINAL_JOB_STATUSES.has(job.status) ? (
        <ScannerCompletionState
          tone="destructive"
          title={getStudentTerminalJobTitle(job.status, job.jobKind)}
          description={getStudentTerminalJobDescription(job.status, job.jobKind, job.images)}
          actionLabel="새 파일 업로드"
          onStartNew={() => clearSelectedJob()}
        />
      ) : null}
    </div>
  );
}

function ReviewPanel({
  job,
  review,
  phase,
  onReviewChange,
  onApply,
  onCancel,
  onStartNew,
  isCancelling,
}: {
  job: StudentVideoJob & { result: StudentGrowthResult };
  review: ReviewState;
  phase: ScannerPhase;
  onReviewChange: React.Dispatch<React.SetStateAction<ReviewState>>;
  onApply: (remainingReviewStudentCount: number) => void;
  onCancel: () => void;
  onStartNew: () => void;
  isCancelling: boolean;
}) {
  const [reviewFilterStudentUids, setReviewFilterStudentUids] = useState<string[] | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<{
    artifact: StudentVideoJob["artifacts"][number];
    studentName: string;
  } | null>(null);
  const unresolvedStudents = job.result.students.filter(({ studentUid }) => !job.studentCatalog?.[studentUid]);
  const failedImages = job.images.filter((image) => image.status === "failed");
  const artifactsByStudentUid = new Map(job.artifacts.map((artifact) => [artifact.studentUid, artifact]));
  const numberInputNavigation = useNumberInputFlowNavigation();
  const remainingReviewStudents = job.result.students.filter((student) => {
    const state = review[student.studentUid];
    return state ? studentNeedsReview(student, state, job.currentStudentStates?.[student.studentUid]) : false;
  });
  const showReviewRequiredOnly = reviewFilterStudentUids !== null;
  const visibleStudents = showReviewRequiredOnly
    ? job.result.students.filter(({ studentUid }) => reviewFilterStudentUids.includes(studentUid))
    : job.result.students;

  const updateStudent = (studentUid: string, update: (current: ReviewStudent) => ReviewStudent) => {
    onReviewChange((current) => {
      const currentStudent = current[studentUid];
      if (!currentStudent) return current;
      return { ...current, [studentUid]: update(currentStudent) };
    });
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SubTitle
          text="인식 결과 검토"
          description={`${job.result.students.length}명 인식 · 미해결 필드 ${job.result.unresolvedCount}개`}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" onClick={onStartNew}>
            새 파일 업로드
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

      {unresolvedStudents.length > 0 ? (
        <Callout
          tone="warning"
          title="학생 식별 필요"
          description={`${unresolvedStudents.length}개 결과는 현재 학생 카탈로그와 확인되지 않아 임의 학생에게 연결하지 않았어요.`}
        />
      ) : null}

      {failedImages.length > 0 ? (
        <Callout
          tone="warning"
          title="일부 이미지를 인식하지 못했어요"
          description={getStudentFailedImagesDescription(failedImages)}
        />
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
                  aria-disabled={!catalogStudent || undefined}
                  className={cn(
                    "border-b border-border align-middle last:border-b-0",
                    !catalogStudent && "bg-muted/30",
                  )}
                >
                  <th
                    scope="row"
                    className={cn("sticky left-0 z-10 bg-card px-1 py-1.5 font-medium", !catalogStudent && "bg-muted")}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="relative w-11 shrink-0">
                          <StudentCard
                            uid={catalogStudent?.uid ?? null}
                            name={catalogStudent?.name ?? student.studentName}
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
                        </div>
                        {artifact ? (
                          <HoverTooltip content="인식 화면 보기">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedPreview({
                                  artifact,
                                  studentName: catalogStudent?.name ?? student.studentName,
                                })
                              }
                              aria-label={`${catalogStudent?.name ?? student.studentName} 인식 화면 보기`}
                              className="inline-flex size-7 shrink-0 cursor-zoom-in items-center justify-center rounded-full text-muted-foreground/60 outline-none transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                            >
                              <PhotoIcon className="size-4" aria-hidden="true" />
                            </button>
                          </HoverTooltip>
                        ) : null}
                      </div>
                      {!catalogStudent ? (
                        <span className="text-xs font-semibold text-destructive">반영 불가</span>
                      ) : null}
                    </div>
                  </th>
                  <td className="border-l border-border px-1 py-1.5 align-top">
                    <ReviewBasicGroup
                      studentName={catalogStudent?.name ?? student.studentName}
                      initialTier={catalogStudent?.initialTier ?? tierField.min}
                      student={student}
                      state={state}
                      currentState={job.currentStudentStates?.[student.studentUid]}
                      disabled={phase === "applied" || !catalogStudent}
                      getInputProps={numberInputNavigation.getInputProps}
                      onValueChange={updateValue}
                    />
                  </td>
                  <ReviewNumberGroup
                    studentName={catalogStudent?.name ?? student.studentName}
                    student={student}
                    state={state}
                    currentState={job.currentStudentStates?.[student.studentUid]}
                    fields={skillFields}
                    disabled={phase === "applied" || !catalogStudent}
                    getInputProps={numberInputNavigation.getInputProps}
                    onValueChange={updateValue}
                  />
                  <ReviewNumberGroup
                    studentName={catalogStudent?.name ?? student.studentName}
                    student={student}
                    state={state}
                    currentState={job.currentStudentStates?.[student.studentUid]}
                    fields={equipmentFields}
                    disabled={phase === "applied" || !catalogStudent}
                    getInputProps={numberInputNavigation.getInputProps}
                    onValueChange={updateValue}
                  />
                  <ReviewNumberGroup
                    studentName={catalogStudent?.name ?? student.studentName}
                    student={student}
                    state={state}
                    currentState={job.currentStudentStates?.[student.studentUid]}
                    fields={abilityFields}
                    disabled={phase === "applied" || !catalogStudent}
                    getInputProps={numberInputNavigation.getInputProps}
                    onValueChange={updateValue}
                  />
                </tr>
              );
            })}
            {visibleStudents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  검토가 필요한 데이터가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="sticky bottom-[var(--mobile-bottom-offset)] z-layer-navigation lg:bottom-4">
        <FloatingActionBar className="mx-3 flex items-center justify-between gap-4 p-4 md:mx-5">
          {remainingReviewStudents.length > 0 ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-300">
              <ExclamationTriangleIcon className="size-4 shrink-0" aria-hidden="true" />
              {remainingReviewStudents.length}명의 데이터 검토 필요
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircleIcon className="size-4 shrink-0" aria-hidden="true" />
              모든 데이터 검토 완료
            </p>
          )}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="danger-subtle"
              disabled={phase === "applying" || phase === "applied" || isCancelling}
              onClick={onCancel}
            >
              {isCancelling ? "취소 중..." : "인식 결과 삭제"}
            </Button>
            <Button
              variant="primary"
              disabled={phase === "applying" || phase === "applied" || isCancelling}
              onClick={() => onApply(remainingReviewStudents.length)}
            >
              {phase === "applying" ? "반영 중..." : phase === "applied" ? "반영 완료" : "성장도 저장"}
            </Button>
          </div>
        </FloatingActionBar>
      </div>
      <RepresentativeFrameDialog jobUid={job.uid} selected={selectedPreview} onClose={() => setSelectedPreview(null)} />
    </section>
  );
}

function RepresentativeFrameDialog({
  jobUid,
  selected,
  onClose,
}: {
  jobUid: string;
  selected: { artifact: StudentVideoJob["artifacts"][number]; studentName: string } | null;
  onClose: () => void;
}) {
  const source = selected
    ? `/api/ocr/jobs/${encodeURIComponent(jobUid)}/artifacts/${encodeURIComponent(selected.artifact.uid)}`
    : "";
  return (
    <Dialog open={selected !== null} onClose={onClose} className="relative z-layer-modal">
      <DialogBackdrop className="fixed inset-0 bg-black/85 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-6">
        <DialogPanel className="relative flex max-h-full w-full max-w-[min(80rem,96vw)] flex-col overflow-hidden rounded-lg border border-white/15 bg-black shadow-2xl">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 text-white">
            <DialogTitle className="truncate text-sm font-medium">
              {selected
                ? `${selected.studentName} 인식 화면 · ${selected.artifact.timestampSeconds.toFixed(1)}초`
                : "인식 화면"}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label="인식 화면 닫기"
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/80 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <XMarkIcon className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 sm:p-4">
            {selected ? (
              <img
                src={source}
                alt={`${selected.studentName} 인식 화면`}
                className="max-h-[calc(100vh-7rem)] max-w-full object-contain"
              />
            ) : null}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
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
      if (!state?.confirmed.tier || (validStudentUids && !validStudentUids.has(student.studentUid))) return [];
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
