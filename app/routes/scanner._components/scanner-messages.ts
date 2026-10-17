import {
  STUDENT_IMAGE_DIMENSIONS_EXCEEDED_CODE,
  STUDENT_IMAGE_DIMENSIONS_EXCEEDED_MESSAGE,
} from "~/domain/student-image-ocr";
import type { ScannerJobStatusErrorKind } from "./scanner-client";

export const scannerMessages = {
  item: {
    uploadAction: "새로 업로드",
    cancel: "이 인식 결과를 취소할까요? 결과는 반영되지 않고 최근 작업에서 사라집니다.",
  },
  student: {
    uploadAction: "새로 업로드",
    cancel: "이 인식 결과를 취소할까요? 결과는 반영되지 않고 최근 작업에서 사라집니다.",
  },
} as const;

export type ScannerTerminalJobKind =
  | "item_inventory_images_v1"
  | "student_detail_images_v1"
  | "student_detail_video_v1";

type ScannerTerminalImage = {
  status: string;
  error?: { code?: string | null; message?: string } | null;
};

export function getScannerNewUploadConfirmation(): string {
  return "현재 인식 결과를 반영하지 않고 새로 업로드할까요?";
}

export function getScannerCancelConfirmation(): string {
  return scannerMessages.item.cancel;
}

export function getScannerUnavailableResultMessage(): string {
  return "인식 결과를 안전하게 확인하지 못했어요. 새로 업로드해 주세요.";
}

// D1: an expired upload is shown as an upload failure. D3: a cancelled result reads as a deleted result.
export function getScannerTerminalJobTitle(status: string, jobKind: ScannerTerminalJobKind): string {
  if (status === "cancelled") return "삭제한 인식 결과예요";
  if (status === "expired") return "업로드에 실패했어요";
  if (jobKind === "item_inventory_images_v1") return "아이템 스크린샷을 인식하지 못했어요";
  return jobKind === "student_detail_images_v1" ? "학생 이미지를 인식하지 못했어요" : "학생 영상을 인식하지 못했어요";
}

export function getScannerTerminalJobDescription(
  status: string,
  jobKind: ScannerTerminalJobKind,
  images: ReadonlyArray<ScannerTerminalImage> = [],
): string {
  if (status === "cancelled") return "새로 업로드해 다시 인식을 시작해 주세요.";
  if (status === "expired")
    return "업로드가 15분 안에 끝나지 않아 작업이 만료됐어요. 파일을 다시 선택해 업로드해 주세요.";
  if (jobKind === "item_inventory_images_v1")
    return "인식하지 못한 스크린샷이 있어요. 새로 업로드해 다시 시도해 주세요.";
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

// The list label splits an upload expiry from a recognition failure. Internal status values never reach the label.
export function getScannerJobStatusLabel(status: string, isApplied: boolean): string {
  if (isApplied) return "반영 완료";
  if (status === "review_ready") return "검토 필요";
  if (status === "queued") return "대기 중";
  if (status === "processing" || status === "finalizing") return "인식 중";
  if (status === "expired") return "업로드 실패";
  if (status === "failed") return "인식 실패";
  if (status === "cancelled") return "삭제됨";
  return "처리 중";
}

export function formatScannerRelativeTime(value: string, now = Date.now()): string {
  const createdAt = new Date(value).getTime();
  if (!Number.isFinite(createdAt)) return "-";
  const elapsedMinutes = Math.max(0, Math.floor((now - createdAt) / 60000));
  if (elapsedMinutes < 1) return "방금";
  if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}시간 전`;
  return `${Math.floor(elapsedHours / 24)}일 전`;
}

// A completion view is either the saved summary or an explicit unavailable state. An unreadable summary never shows zero counts.
export type ScannerCompletionState<T> =
  | { kind: "summary"; summary: T }
  | { kind: "loading" }
  | { kind: "unavailable"; message: string };

// Undefined is a summary not read yet (right after apply, before the job detail is re-read); null is a summary the server
// could not build. Only null is the unavailable state.
export function getScannerCompletionState<T>(summary: T | null | undefined): ScannerCompletionState<T> {
  if (summary) return { kind: "summary", summary };
  if (summary === undefined) return { kind: "loading" };
  return { kind: "unavailable", message: "반영 기록을 확인하지 못했어요. 새로고침한 뒤 다시 확인해 주세요." };
}

// A failed job status read: a missing job asks for a new upload, and a transient failure can be retried.
export function getScannerJobStatusView(kind: ScannerJobStatusErrorKind): {
  title: string;
  action: "retry" | "startNew";
} {
  if (kind === "not_found") return { title: "작업을 찾을 수 없어요", action: "startNew" };
  return { title: "인식 작업 상태를 확인하지 못했어요.", action: "retry" };
}
