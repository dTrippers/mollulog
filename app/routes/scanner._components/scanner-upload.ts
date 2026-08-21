import {
  OCR_ALLOWED_CONTENT_TYPES,
  OCR_ALLOWED_VIDEO_CONTENT_TYPES,
  OCR_MAX_IMAGE_BYTES,
  OCR_MAX_IMAGES,
  OCR_MAX_JOB_BYTES,
  OCR_MAX_VIDEO_BYTES,
} from "~/domain/ocr";

export type ScannerAcceptSpec = {
  images?: { max: number; maxBytes?: number; totalMaxBytes?: number };
  video?: { max: number; maxBytes?: number };
};

export type ScannerUploadSelection = {
  images: File[];
  video: File | null;
};

export type ScannerUploadValidation = ScannerUploadSelection & {
  error: string | null;
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov"]);

export const ITEM_SCANNER_ACCEPT_SPEC: ScannerAcceptSpec = {
  images: { max: OCR_MAX_IMAGES, maxBytes: OCR_MAX_IMAGE_BYTES, totalMaxBytes: OCR_MAX_JOB_BYTES },
};

export const STUDENT_SCANNER_ACCEPT_SPEC: ScannerAcceptSpec = {
  images: { max: OCR_MAX_IMAGES, maxBytes: OCR_MAX_IMAGE_BYTES, totalMaxBytes: OCR_MAX_JOB_BYTES },
  video: { max: 1, maxBytes: OCR_MAX_VIDEO_BYTES },
};

export function scannerFileKey(file: File): string {
  return `${file.name}\0${file.size}\0${file.lastModified}`;
}

export function mergeScannerFiles(current: ReadonlyArray<File>, candidates: ReadonlyArray<File>): File[] {
  const merged: File[] = [];
  const seen = new Set<string>();
  for (const file of [...current, ...candidates]) {
    const key = scannerFileKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(file);
  }
  return merged;
}

export function validateScannerFiles(files: ReadonlyArray<File>, spec: ScannerAcceptSpec): ScannerUploadValidation {
  const images: File[] = [];
  let video: File | null = null;

  for (const file of files) {
    const mediaKind = getMediaKind(file);
    if (mediaKind === "conflict") {
      return { images: [], video: null, error: "파일의 MIME 타입과 확장자가 일치하지 않아요. 파일을 확인해 주세요." };
    }
    if (mediaKind === "image" && spec.images) {
      if (!getScannerImageContentType(file)) {
        return { images: [], video: null, error: unsupportedFileMessage(spec) };
      }
      images.push(file);
      continue;
    }
    if (mediaKind === "video" && spec.video) {
      if (!getScannerVideoContentType(file)) {
        return { images: [], video: null, error: unsupportedFileMessage(spec) };
      }
      if (video) return { images: [], video: null, error: "영상은 한 번에 한 개만 선택할 수 있어요." };
      video = file;
      continue;
    }
    return { images: [], video: null, error: unsupportedFileMessage(spec) };
  }

  if (spec.images) {
    if (images.length === 0 && !video) {
      return { images, video, error: null };
    }
    if (images.length > spec.images.max) {
      return {
        images: [],
        video: null,
        error: `이미지는 1장부터 ${spec.images.max}장까지 선택할 수 있어요.`,
      };
    }
    const maxBytes = spec.images.maxBytes ?? OCR_MAX_IMAGE_BYTES;
    if (images.some((image) => image.size <= 0 || image.size > maxBytes)) {
      return { images: [], video: null, error: "이미지 한 장은 10MB를 넘을 수 없어요." };
    }
    const totalMaxBytes = spec.images.totalMaxBytes;
    if (totalMaxBytes !== undefined && images.reduce((sum, image) => sum + image.size, 0) > totalMaxBytes) {
      return { images: [], video: null, error: "한 작업의 이미지 전체 용량은 120MB를 넘을 수 없어요." };
    }
  }

  if (spec.video && video && (video.size <= 0 || video.size > (spec.video.maxBytes ?? OCR_MAX_VIDEO_BYTES))) {
    return { images: [], video: null, error: "영상은 250MB를 넘을 수 없어요." };
  }

  return { images, video, error: null };
}

export function getScannerImageContentType(file: File): (typeof OCR_ALLOWED_CONTENT_TYPES)[number] | null {
  const mimeType = file.type.toLowerCase();
  if (OCR_ALLOWED_CONTENT_TYPES.includes(mimeType as (typeof OCR_ALLOWED_CONTENT_TYPES)[number])) {
    return mimeType as (typeof OCR_ALLOWED_CONTENT_TYPES)[number];
  }
  if (mimeType?.startsWith("image/")) return null;
  if (mimeType?.startsWith("video/")) return null;
  const extension = getExtension(file);
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return null;
}

export function getScannerVideoContentType(file: File): (typeof OCR_ALLOWED_VIDEO_CONTENT_TYPES)[number] | null {
  const mimeType = file.type.toLowerCase();
  if (OCR_ALLOWED_VIDEO_CONTENT_TYPES.includes(mimeType as (typeof OCR_ALLOWED_VIDEO_CONTENT_TYPES)[number])) {
    return mimeType as (typeof OCR_ALLOWED_VIDEO_CONTENT_TYPES)[number];
  }
  if (mimeType && (mimeType.startsWith("image/") || mimeType.startsWith("video/"))) return null;
  const extension = getExtension(file);
  if (extension === "mp4") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  return null;
}

function unsupportedFileMessage(spec: ScannerAcceptSpec): string {
  return spec.video
    ? "지원하는 파일은 PNG, JPEG, WebP 이미지와 MP4, MOV 영상이에요."
    : "PNG, JPEG, WebP 이미지만 첨부할 수 있어요.";
}

function getExtension(file: File): string | null {
  return file.name.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? null;
}

function getMimeKind(file: File): "image" | "video" | null {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

function getExtensionKind(file: File): "image" | "video" | null {
  const extension = getExtension(file);
  if (extension && IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension && VIDEO_EXTENSIONS.has(extension)) return "video";
  return null;
}

function getMediaKind(file: File): "image" | "video" | "unknown" | "conflict" {
  const mimeKind = getMimeKind(file);
  const extensionKind = getExtensionKind(file);
  if (mimeKind && extensionKind && mimeKind !== extensionKind) return "conflict";
  return mimeKind ?? extensionKind ?? "unknown";
}
