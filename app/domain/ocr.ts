export const OCR_CONTRACT_VERSION = "1";
export const OCR_STUDENT_IMAGE_CONTRACT_VERSION = "1";
export const OCR_STUDENT_VIDEO_CONTRACT_VERSION = "2";
export const OCR_MAX_IMAGES = 30;
export const OCR_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const OCR_MAX_JOB_BYTES = 120 * 1024 * 1024;
export const OCR_MAX_VIDEO_BYTES = 250 * 1024 * 1024;
export const OCR_MAX_STUDENT_ARTIFACTS = 300;
export const OCR_MAX_ARTIFACT_BYTES = 1024 * 1024;
export const OCR_MAX_ARTIFACT_WIDTH = 1040;
export const OCR_UPLOAD_EXPIRES_SECONDS = 15 * 60;
export const OCR_DOWNLOAD_EXPIRES_SECONDS = 5 * 60;
export const OCR_JOB_VISIBILITY_DAYS = 7;
export const OCR_JOB_PURGE_GRACE_DAYS = 3;
export const OCR_ROLLING_IMAGE_LIMIT = 50;
export const OCR_ROLLING_VIDEO_LIMIT = 10;
export const OCR_QUOTA_WINDOW_DAYS = 7;
export const OCR_TRAINING_CONSENT_VERSION = "2026-07-23-v1";
export const OCR_CANDIDATE_SELECTION_LIMIT = 5;

export const OCR_ALLOWED_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const OCR_ALLOWED_VIDEO_CONTENT_TYPES = ["video/mp4", "video/quicktime"] as const;
export const OCR_ALLOWED_VIDEO_CONTAINERS = ["mp4", "mov"] as const;

export type OcrJobKind = "item_inventory_images_v1" | "student_detail_images_v1" | "student_detail_video_v1";
export type OcrTaskType =
  | "ocr.image.recognize.v1"
  | "ocr.job.finalize.v1"
  | "ocr.student_detail_image.recognize.v1"
  | "ocr.student_detail_video.recognize.v1";

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

export type OcrImageUploadRequest = {
  jobKind: "item_inventory_images_v1" | "student_detail_images_v1";
  images: OcrUploadInput[];
  trainingConsent: boolean;
};

export type OcrVideoUploadInput = {
  filename: string;
  contentType: (typeof OCR_ALLOWED_VIDEO_CONTENT_TYPES)[number];
  byteSize: number;
  sha256: string;
};

export type OcrStudentVideoUploadRequest = {
  jobKind: "student_detail_video_v1";
  video: OcrVideoUploadInput;
  trainingConsent: boolean;
};

export type OcrUploadRequest = OcrImageUploadRequest | OcrStudentVideoUploadRequest;

export type OcrResultArtifactReference = {
  artifactUid: string;
  studentUid: string;
};

export type OcrArtifactManifest = {
  studentUid: string;
  sourceFrame: number;
  timestampSeconds: number;
  contentType: "image/webp";
  byteSize: number;
  sha256: string;
  width: number;
  height: number;
};

export type OcrArtifactPreparationRequest = {
  attemptUid: string;
  artifacts: OcrArtifactManifest[];
};

export type OcrResultEnvelope =
  | {
      attemptUid: string;
      status: "succeeded";
      inputSha256: string;
      modelVersion: string;
      catalogVersion: string;
      schemaVersion: string;
      result: unknown;
      artifacts?: OcrResultArtifactReference[];
      error?: never;
    }
  | {
      attemptUid: string;
      status: "failed";
      error: { code: string; message: string };
      inputSha256?: never;
      modelVersion?: never;
      catalogVersion?: never;
      schemaVersion?: never;
      result?: never;
    };

export class OcrTaskResultRejectedError extends Error {
  override readonly name = "OcrTaskResultRejectedError";
}

export class OcrPublicError extends Error {
  override readonly name = "OcrPublicError";

  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function toPublicOcrError(
  error: unknown,
  fallback: string,
): { message: string; status: number; expected: boolean } {
  return error instanceof OcrPublicError
    ? { message: error.message, status: error.status, expected: true }
    : { message: fallback, status: 500, expected: false };
}

export function parseOcrUploadInputs(value: unknown): OcrUploadInput[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { images?: unknown }).images)) {
    throw new OcrPublicError("이미지 목록을 확인해주세요");
  }

  const images = (value as { images: unknown[] }).images;
  if (images.length === 0 || images.length > OCR_MAX_IMAGES) {
    throw new OcrPublicError(`이미지는 1장부터 ${OCR_MAX_IMAGES}장까지 제출할 수 있어요`);
  }

  const parsed = images.map(parseOcrUploadInput);
  if (parsed.reduce((total, image) => total + image.byteSize, 0) > OCR_MAX_JOB_BYTES) {
    throw new OcrPublicError("한 작업의 이미지 전체 용량은 120MB를 넘을 수 없어요");
  }
  return parsed;
}

export function parseOcrUploadRequest(value: unknown): OcrUploadRequest {
  if (value && typeof value === "object") {
    const request = value as { jobKind?: unknown; images?: unknown; video?: unknown };
    const jobKind = request.jobKind;
    if (jobKind === "student_detail_video_v1") {
      if (request.images !== undefined) {
        throw new OcrPublicError("이미지와 영상은 한 작업에 함께 제출할 수 없어요");
      }
      return {
        jobKind,
        video: parseOcrVideoUploadInput(request.video),
        trainingConsent: (value as { trainingConsent?: unknown }).trainingConsent === true,
      };
    }
    if (
      jobKind !== undefined &&
      jobKind !== "item_inventory_images_v1" &&
      jobKind !== "student_detail_images_v1"
    ) {
      throw new OcrPublicError("요청한 인식 방식은 현재 사용할 수 없어요");
    }
    if (request.video !== undefined) {
      throw new OcrPublicError("이미지와 영상은 한 작업에 함께 제출할 수 없어요");
    }
    const images = parseOcrUploadInputs(value);
    return {
      jobKind: jobKind === "student_detail_images_v1" ? jobKind : "item_inventory_images_v1",
      images,
      trainingConsent: Boolean(
        (value as { trainingConsent?: unknown }).trainingConsent === true,
      ),
    };
  }
  return {
    jobKind: "item_inventory_images_v1",
    images: parseOcrUploadInputs(value),
    trainingConsent: Boolean(
      value && typeof value === "object" && (value as { trainingConsent?: unknown }).trainingConsent === true,
    ),
  };
}

function parseOcrVideoUploadInput(value: unknown): OcrVideoUploadInput {
  if (!value || typeof value !== "object") {
    throw new OcrPublicError("영상 정보를 확인해주세요");
  }
  const input = value as Record<string, unknown>;
  const filename = typeof input.filename === "string" ? input.filename.trim() : "";
  const contentType = typeof input.contentType === "string" ? input.contentType : "";
  const byteSize = input.byteSize;
  const sha256 = typeof input.sha256 === "string" ? input.sha256.toLowerCase() : "";

  if (!filename || filename.length > 255 || filename.includes("\0")) {
    throw new OcrPublicError("영상 파일명을 확인해주세요");
  }
  if (!OCR_ALLOWED_VIDEO_CONTENT_TYPES.includes(contentType as OcrVideoUploadInput["contentType"])) {
    throw new OcrPublicError("MP4 또는 MOV 영상만 제출할 수 있어요");
  }
  const extension = filename.toLowerCase().match(/\.([^.]+)$/)?.[1];
  if (
    (contentType === "video/mp4" && extension !== "mp4") ||
    (contentType === "video/quicktime" && extension !== "mov")
  ) {
    throw new OcrPublicError("영상 파일의 확장자와 형식을 확인해주세요");
  }
  if (!Number.isInteger(byteSize) || (byteSize as number) <= 0 || (byteSize as number) > OCR_MAX_VIDEO_BYTES) {
    throw new OcrPublicError("영상은 250MB를 넘을 수 없어요");
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new OcrPublicError("영상 파일 정보를 다시 확인해주세요");
  }

  return {
    filename,
    contentType: contentType as OcrVideoUploadInput["contentType"],
    byteSize: byteSize as number,
    sha256,
  };
}

function parseOcrUploadInput(value: unknown): OcrUploadInput {
  if (!value || typeof value !== "object") {
    throw new OcrPublicError("이미지 정보를 확인해주세요");
  }
  const input = value as Record<string, unknown>;
  const filename = typeof input.filename === "string" ? input.filename.trim() : "";
  const contentType = typeof input.contentType === "string" ? input.contentType : "";
  const byteSize = input.byteSize;
  const sha256 = typeof input.sha256 === "string" ? input.sha256.toLowerCase() : "";

  if (!filename || filename.length > 255 || filename.includes("\0")) {
    throw new OcrPublicError("이미지 파일명을 확인해주세요");
  }
  if (!OCR_ALLOWED_CONTENT_TYPES.includes(contentType as OcrUploadInput["contentType"])) {
    throw new OcrPublicError("PNG, JPEG, WebP 이미지만 제출할 수 있어요");
  }
  if (!Number.isInteger(byteSize) || (byteSize as number) <= 0 || (byteSize as number) > OCR_MAX_IMAGE_BYTES) {
    throw new OcrPublicError("이미지 한 장은 10MB를 넘을 수 없어요");
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new OcrPublicError("이미지 파일 정보를 다시 확인해주세요");
  }

  return { filename, contentType: contentType as OcrUploadInput["contentType"], byteSize: byteSize as number, sha256 };
}

export function parseOcrTaskMessage(value: unknown): OcrTaskMessage {
  if (!value || typeof value !== "object") {
    throw new Error("작업 메시지를 확인해주세요");
  }
  const message = value as Record<string, unknown>;
  if (
    message.type !== "ocr.image.recognize.v1" &&
    message.type !== "ocr.job.finalize.v1" &&
    message.type !== "ocr.student_detail_image.recognize.v1" &&
    message.type !== "ocr.student_detail_video.recognize.v1"
  ) {
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

export function parseOcrArtifactPreparationRequest(value: unknown): OcrArtifactPreparationRequest {
  if (!value || typeof value !== "object") {
    throw new Error("OCR artifact 요청을 확인해주세요");
  }
  const input = value as Record<string, unknown>;
  if (typeof input.attemptUid !== "string" || !input.attemptUid) {
    throw new Error("attemptUid가 필요해요");
  }
  if (
    !Array.isArray(input.artifacts) ||
    input.artifacts.length === 0 ||
    input.artifacts.length > OCR_MAX_STUDENT_ARTIFACTS
  ) {
    throw new Error("OCR artifact 목록을 확인해주세요");
  }
  const artifacts = input.artifacts.map((value) => {
    if (!value || typeof value !== "object") throw new Error("OCR artifact 정보를 확인해주세요");
    const artifact = value as Record<string, unknown>;
    const studentUid = typeof artifact.studentUid === "string" ? artifact.studentUid.trim() : "";
    const sourceFrame = artifact.sourceFrame;
    const timestampSeconds = artifact.timestampSeconds;
    const byteSize = artifact.byteSize;
    const width = artifact.width;
    const height = artifact.height;
    const sha256 = typeof artifact.sha256 === "string" ? artifact.sha256.toLowerCase() : "";
    if (!studentUid || studentUid.length > 128) throw new Error("studentUid를 확인해주세요");
    if (!Number.isInteger(sourceFrame) || (sourceFrame as number) < 0) throw new Error("sourceFrame을 확인해주세요");
    if (typeof timestampSeconds !== "number" || !Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
      throw new Error("timestampSeconds를 확인해주세요");
    }
    if (artifact.contentType !== "image/webp") throw new Error("artifact content type을 확인해주세요");
    if (!Number.isInteger(byteSize) || (byteSize as number) <= 0 || (byteSize as number) > OCR_MAX_ARTIFACT_BYTES) {
      throw new Error("artifact byte size를 확인해주세요");
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("artifact SHA-256을 확인해주세요");
    if (!Number.isInteger(width) || (width as number) <= 0 || (width as number) > OCR_MAX_ARTIFACT_WIDTH) {
      throw new Error("artifact width를 확인해주세요");
    }
    if (!Number.isInteger(height) || (height as number) <= 0 || (height as number) > 4096) {
      throw new Error("artifact height를 확인해주세요");
    }
    return {
      studentUid,
      sourceFrame: sourceFrame as number,
      timestampSeconds,
      contentType: "image/webp" as const,
      byteSize: byteSize as number,
      sha256,
      width: width as number,
      height: height as number,
    };
  });
  if (new Set(artifacts.map(({ studentUid }) => studentUid)).size !== artifacts.length) {
    throw new Error("같은 학생의 artifact가 중복되었어요");
  }
  return { attemptUid: input.attemptUid, artifacts };
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
    if (result.artifacts !== undefined) {
      if (!Array.isArray(result.artifacts)) throw new Error("artifact 참조를 확인해주세요");
      const references = result.artifacts.map((value) => {
        if (!value || typeof value !== "object") throw new Error("artifact 참조를 확인해주세요");
        const reference = value as Record<string, unknown>;
        if (typeof reference.artifactUid !== "string" || !reference.artifactUid) {
          throw new Error("artifactUid가 필요해요");
        }
        if (typeof reference.studentUid !== "string" || !reference.studentUid) {
          throw new Error("artifact studentUid가 필요해요");
        }
        return { artifactUid: reference.artifactUid, studentUid: reference.studentUid };
      });
      if (new Set(references.map(({ artifactUid }) => artifactUid)).size !== references.length) {
        throw new Error("artifact 참조가 중복되었어요");
      }
      result.artifacts = references;
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
