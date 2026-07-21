export const OCR_CONTRACT_VERSION = "1";
export const OCR_MAX_IMAGES = 30;
export const OCR_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const OCR_MAX_JOB_BYTES = 120 * 1024 * 1024;
export const OCR_UPLOAD_EXPIRES_SECONDS = 15 * 60;
export const OCR_DOWNLOAD_EXPIRES_SECONDS = 5 * 60;
export const OCR_JOB_RETENTION_DAYS = 7;
export const OCR_CANDIDATE_SELECTION_LIMIT = 5;

export const OCR_ALLOWED_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type OcrTaskType = "ocr.image.recognize.v1" | "ocr.job.finalize.v1";

export type OcrTaskMessage = {
  type: OcrTaskType;
  taskUid: string;
  generation: number;
};

export type OcrUploadInput = {
  filename: string;
  contentType: (typeof OCR_ALLOWED_CONTENT_TYPES)[number];
  byteSize: number;
  sha256: string;
};

export type OcrResultEnvelope = {
  attemptUid: string;
  status: "succeeded" | "failed";
  inputSha256?: string;
  modelVersion?: string;
  catalogVersion?: string;
  schemaVersion?: string;
  result?: unknown;
  error?: { code: string; message: string };
};

export function parseOcrUploadInputs(value: unknown): OcrUploadInput[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { images?: unknown }).images)) {
    throw new Error("이미지 목록을 확인해주세요");
  }

  const images = (value as { images: unknown[] }).images;
  if (images.length === 0 || images.length > OCR_MAX_IMAGES) {
    throw new Error(`이미지는 1장부터 ${OCR_MAX_IMAGES}장까지 제출할 수 있어요`);
  }

  const parsed = images.map(parseOcrUploadInput);
  if (parsed.reduce((total, image) => total + image.byteSize, 0) > OCR_MAX_JOB_BYTES) {
    throw new Error("한 작업의 이미지 전체 용량은 120MB를 넘을 수 없어요");
  }
  return parsed;
}

function parseOcrUploadInput(value: unknown): OcrUploadInput {
  if (!value || typeof value !== "object") {
    throw new Error("이미지 정보를 확인해주세요");
  }
  const input = value as Record<string, unknown>;
  const filename = typeof input.filename === "string" ? input.filename.trim() : "";
  const contentType = typeof input.contentType === "string" ? input.contentType : "";
  const byteSize = input.byteSize;
  const sha256 = typeof input.sha256 === "string" ? input.sha256.toLowerCase() : "";

  if (!filename || filename.length > 255 || filename.includes("\0")) {
    throw new Error("이미지 파일명을 확인해주세요");
  }
  if (!OCR_ALLOWED_CONTENT_TYPES.includes(contentType as OcrUploadInput["contentType"])) {
    throw new Error("PNG, JPEG, WebP 이미지만 제출할 수 있어요");
  }
  if (!Number.isInteger(byteSize) || (byteSize as number) <= 0 || (byteSize as number) > OCR_MAX_IMAGE_BYTES) {
    throw new Error("이미지 한 장은 10MB를 넘을 수 없어요");
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("이미지 SHA-256 값을 확인해주세요");
  }

  return { filename, contentType: contentType as OcrUploadInput["contentType"], byteSize: byteSize as number, sha256 };
}

export function parseOcrTaskMessage(value: unknown): OcrTaskMessage {
  if (!value || typeof value !== "object") {
    throw new Error("작업 메시지를 확인해주세요");
  }
  const message = value as Record<string, unknown>;
  if (message.type !== "ocr.image.recognize.v1" && message.type !== "ocr.job.finalize.v1") {
    throw new Error("지원하지 않는 OCR 작업이에요");
  }
  if (typeof message.taskUid !== "string" || !message.taskUid.trim()) {
    throw new Error("OCR 작업 UID가 필요해요");
  }
  if (!Number.isInteger(message.generation) || (message.generation as number) < 1) {
    throw new Error("OCR 작업 generation을 확인해주세요");
  }
  return {
    type: message.type,
    taskUid: message.taskUid,
    generation: message.generation as number,
  };
}

export function parseOcrResultEnvelope(value: unknown): OcrResultEnvelope {
  if (!value || typeof value !== "object") {
    throw new Error("OCR 결과를 확인해주세요");
  }
  const result = value as Record<string, unknown>;
  if (typeof result.attemptUid !== "string" || !result.attemptUid) {
    throw new Error("attemptUid가 필요해요");
  }
  if (result.status !== "succeeded" && result.status !== "failed") {
    throw new Error("OCR 결과 상태를 확인해주세요");
  }
  if (result.status === "succeeded") {
    for (const key of ["modelVersion", "catalogVersion", "schemaVersion", "inputSha256"] as const) {
      if (typeof result[key] !== "string" || !result[key]) {
        throw new Error(`${key}가 필요해요`);
      }
    }
    if (!("result" in result)) {
      throw new Error("인식 결과가 필요해요");
    }
  } else {
    const error = result.error;
    if (!error || typeof error !== "object") {
      throw new Error("실패 사유가 필요해요");
    }
    const details = error as Record<string, unknown>;
    if (typeof details.code !== "string" || typeof details.message !== "string") {
      throw new Error("실패 사유를 확인해주세요");
    }
  }
  return result as OcrResultEnvelope;
}

export function isOcrJobTerminal(status: string): boolean {
  return status === "review_ready" || status === "failed" || status === "cancelled" || status === "expired";
}
