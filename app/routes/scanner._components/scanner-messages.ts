import {
  STUDENT_IMAGE_DIMENSIONS_EXCEEDED_CODE,
  STUDENT_IMAGE_DIMENSIONS_EXCEEDED_MESSAGE,
} from "~/domain/student-image-ocr";

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

export function getScannerTerminalJobTitle(status: string, jobKind: ScannerTerminalJobKind): string {
  if (jobKind === "item_inventory_images_v1") {
    if (status === "cancelled") return "아이템 스크린샷 인식 작업이 취소됐어요";
    if (status === "expired") return "아이템 스크린샷 인식 작업이 만료됐어요";
    return "아이템 스크린샷을 인식하지 못했어요";
  }
  if (status === "cancelled") return "학생 성장도 인식 작업이 취소됐어요";
  if (status === "expired") return "학생 성장도 인식 작업이 만료됐어요";
  return jobKind === "student_detail_images_v1" ? "학생 이미지를 인식하지 못했어요" : "학생 영상을 인식하지 못했어요";
}

export function getScannerTerminalJobDescription(
  status: string,
  jobKind: ScannerTerminalJobKind,
  images: ReadonlyArray<ScannerTerminalImage> = [],
): string {
  if (jobKind === "item_inventory_images_v1") {
    if (status === "cancelled") return "새로 업로드해 다시 인식을 시작해 주세요.";
    if (status === "expired") return "보관 기간이 지난 작업이에요. 새로 업로드해 다시 시도해 주세요.";
    return "인식하지 못한 스크린샷이 있어요. 새로 업로드해 다시 시도해 주세요.";
  }
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
