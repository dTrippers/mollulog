import { type OcrResultEnvelope, OcrTaskResultRejectedError } from "~/domain/ocr";
import {
  type StudentVideoFieldDetail,
  type StudentVideoFieldName,
  type StudentVideoFieldState,
  studentVideoFieldNames,
} from "~/domain/student-video-ocr";

export const STUDENT_IMAGE_TASK_RESULT_SCHEMA_VERSION = "student-detail-image-result.v1";
export const STUDENT_IMAGE_RESULT_SCHEMA_VERSION = "student-detail-images-result.v1";
export const STUDENT_IMAGE_DIMENSIONS_EXCEEDED_CODE = "image_dimensions_exceeded";
export const STUDENT_IMAGE_DIMENSIONS_EXCEEDED_MESSAGE = "이미지 해상도가 너무 커요. 4K급 이미지를 사용해 주세요.";

export type StudentDetailImageStudent = {
  studentUid: string;
  studentName: string;
  fields: Record<StudentVideoFieldName, number | null>;
  fieldDetails: Record<StudentVideoFieldName, StudentVideoFieldDetail>;
  sourceImageUids: string[];
  nameConfidence: number;
  reasons: string[];
};

export type StudentDetailImageTaskResult = {
  schemaVersion: 1;
  jobType: "student_detail_image_v1";
  executionProvider: "cpu" | "coreml";
  image: {
    imageUid: string;
    filename: string;
    width: number;
    height: number;
  };
  students: StudentDetailImageStudent[];
  unresolvedCount: number;
  elapsedMs: number;
};

export type StudentDetailImagesResult = {
  schemaVersion: 1;
  jobType: "student_detail_images_v1";
  executionProvider: "cpu" | "coreml";
  images: Array<{
    imageUid: string;
    filename: string;
    width: number;
    height: number;
    studentUids: string[];
  }>;
  students: StudentDetailImageStudent[];
  unresolvedCount: number;
  elapsedMs: number;
};

const fieldRanges: Record<StudentVideoFieldName, readonly [number, number]> = {
  tier: [1, 9],
  level: [1, 90],
  weaponLevel: [0, 60],
  abilityHp: [0, 25],
  abilityAtk: [0, 25],
  abilityHeal: [0, 25],
  skillEx: [1, 5],
  skillNormal: [1, 10],
  skillEnhanced: [1, 10],
  skillSub: [1, 10],
  equip1: [1, 10],
  equip2: [1, 10],
  equip3: [1, 10],
  equipSpecial: [1, 2],
  relationshipRank: [1, 100],
};

export function parseStudentDetailImageEnvelope(
  envelope: OcrResultEnvelope,
): OcrResultEnvelope & { status: "succeeded"; result: StudentDetailImageTaskResult } {
  if (envelope.status !== "succeeded") {
    throw new OcrTaskResultRejectedError("성공한 학생 이미지 결과가 필요해요");
  }
  if (envelope.schemaVersion !== STUDENT_IMAGE_TASK_RESULT_SCHEMA_VERSION) {
    throw new OcrTaskResultRejectedError("지원하지 않는 학생 이미지 결과 schema예요");
  }
  return { ...envelope, result: parseStudentDetailImageTaskResult(envelope.result) };
}

export function parseStudentDetailImageTaskResult(value: unknown): StudentDetailImageTaskResult {
  const result = asRecord(value, "학생 이미지 인식 결과");
  if (result.schemaVersion !== 1 || result.jobType !== "student_detail_image_v1") {
    throw new Error("지원하지 않는 학생 이미지 작업 결과 형식이에요");
  }
  const image = parseImageMetadata(result.image);
  const students = parseStudents(result.students);
  if (new Set(students.map(({ studentUid }) => studentUid)).size !== students.length) {
    throw new Error("학생 이미지 작업 결과에 같은 학생 UID가 두 번 포함되어 있어요");
  }
  if (students.some((student) => !student.sourceImageUids.includes(image.imageUid))) {
    throw new Error("학생 이미지 결과의 출처 UID를 확인해주세요");
  }
  return {
    schemaVersion: 1,
    jobType: "student_detail_image_v1",
    executionProvider: parseProvider(result.executionProvider),
    image,
    students,
    unresolvedCount: parseNonNegativeInteger(result.unresolvedCount, "미해결 필드 수"),
    elapsedMs: parseNonNegativeNumber(result.elapsedMs, "처리 시간"),
  };
}

export function parseStudentDetailImagesResult(value: unknown): StudentDetailImagesResult {
  const result = asRecord(value, "학생 이미지 묶음 인식 결과");
  if (result.schemaVersion !== 1 || result.jobType !== "student_detail_images_v1") {
    throw new Error("지원하지 않는 학생 이미지 묶음 결과 형식이에요");
  }
  if (!Array.isArray(result.images) || result.images.length === 0) {
    throw new Error("학생 이미지 출처 목록을 확인해주세요");
  }
  const images = result.images.map((image) => parseImageSource(image));
  if (new Set(images.map(({ imageUid }) => imageUid)).size !== images.length) {
    throw new Error("학생 이미지 출처 UID가 중복되어 있어요");
  }
  const students = parseStudents(result.students);
  if (new Set(students.map(({ studentUid }) => studentUid)).size !== students.length) {
    throw new Error("학생 이미지 결과에 같은 학생 UID가 두 번 포함되어 있어요");
  }
  const imageUids = new Set(images.map(({ imageUid }) => imageUid));
  if (students.some((student) => student.sourceImageUids.some((uid) => !imageUids.has(uid)))) {
    throw new Error("학생 이미지 결과가 존재하지 않는 출처를 가리켜요");
  }
  return {
    schemaVersion: 1,
    jobType: "student_detail_images_v1",
    executionProvider: parseProvider(result.executionProvider),
    images,
    students,
    unresolvedCount: parseNonNegativeInteger(result.unresolvedCount, "미해결 필드 수"),
    elapsedMs: parseNonNegativeNumber(result.elapsedMs, "처리 시간"),
  };
}

function parseStudents(value: unknown): StudentDetailImageStudent[] {
  if (!Array.isArray(value)) throw new Error("학생 이미지 결과의 학생 목록을 확인해주세요");
  return value.map((student) => {
    const parsed = asRecord(student, "학생 이미지 학생");
    const fieldsInput = asRecord(parsed.fields, "학생 이미지 필드");
    const detailsInput = asRecord(parsed.fieldDetails, "학생 이미지 필드 상세");
    const fields = {} as Record<StudentVideoFieldName, number | null>;
    const fieldDetails = {} as Record<StudentVideoFieldName, StudentVideoFieldDetail>;
    for (const field of studentVideoFieldNames) {
      const detail = parseFieldDetail(field, detailsInput[field]);
      const value = parseNullableFieldValue(field, fieldsInput[field]);
      if (value !== detail.value) throw new Error(`${field}의 평면 값과 상세 값이 일치하지 않아요`);
      fields[field] = value;
      fieldDetails[field] = detail;
    }
    const sourceImageUids = parseStringArray(parsed.sourceImageUids, "학생 이미지 출처 UID");
    if (sourceImageUids.length === 0) throw new Error("학생 이미지 출처 UID가 필요해요");
    return {
      studentUid: parseNonEmptyString(parsed.studentUid, "학생 UID"),
      studentName: parseNonEmptyString(parsed.studentName, "학생 이름"),
      fields,
      fieldDetails,
      sourceImageUids,
      nameConfidence: parseConfidence(parsed.nameConfidence, "학생 이름 신뢰도"),
      reasons: parseStringArray(parsed.reasons, "학생 검토 사유"),
    };
  });
}

function parseImageMetadata(value: unknown): StudentDetailImageTaskResult["image"] {
  const image = asRecord(value, "이미지 메타데이터");
  return {
    imageUid: parseNonEmptyString(image.imageUid, "이미지 UID"),
    filename: parseNonEmptyString(image.filename, "이미지 파일명"),
    width: parsePositiveInteger(image.width, "이미지 너비"),
    height: parsePositiveInteger(image.height, "이미지 높이"),
  };
}

function parseImageSource(value: unknown): StudentDetailImagesResult["images"][number] {
  const image = parseImageMetadata(value);
  return { ...image, studentUids: parseStringArray(asRecord(value, "이미지 출처").studentUids, "이미지 학생 UID") };
}

function parseFieldDetail(field: StudentVideoFieldName, value: unknown): StudentVideoFieldDetail {
  const detail = asRecord(value, `${field} 상세`);
  const state = detail.state;
  if (state !== "recognized" && state !== "not_applicable" && state !== "unknown" && state !== "conflict") {
    throw new Error(`${field} 상태를 확인해주세요`);
  }
  const parsedValue = parseNullableFieldValue(field, detail.value);
  if (state === "recognized" && parsedValue === null) throw new Error(`${field}의 recognized 값이 필요해요`);
  if (state !== "recognized" && parsedValue !== null) throw new Error(`${field}의 판독 불가 값은 null이어야 해요`);
  return {
    state: state as StudentVideoFieldState,
    value: parsedValue,
    confidence: parseConfidence(detail.confidence, `${field} 신뢰도`),
    evidence: parseStringArray(detail.evidence, `${field} 근거`),
  };
}

function parseNullableFieldValue(field: StudentVideoFieldName, value: unknown): number | null {
  if (value === null) return null;
  const [min, max] = fieldRanges[field];
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${field} 값은 ${min}부터 ${max} 사이의 정수여야 해요`);
  }
  return value as number;
}

function parseProvider(value: unknown): "cpu" | "coreml" {
  if (value !== "cpu" && value !== "coreml") throw new Error("학생 이미지 실행 provider를 확인해주세요");
  return value;
}

function parseNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}이(가) 필요해요`);
  return value.trim();
}

function parseStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim()))
    throw new Error(`${label} 형식을 확인해주세요`);
  return value.map((item) => item.trim());
}

function parseConfidence(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
    throw new Error(`${label}는 0부터 1 사이여야 해요`);
  return value;
}

function parsePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label}을(를) 확인해주세요`);
  return value as number;
}

function parseNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${label}을(를) 확인해주세요`);
  return value as number;
}

function parseNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label}을(를) 확인해주세요`);
  return value;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 형식을 확인해주세요`);
  return value as Record<string, unknown>;
}
