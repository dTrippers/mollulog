import { OCR_ALLOWED_VIDEO_CONTAINERS, type OcrResultEnvelope, OcrTaskResultRejectedError } from "~/domain/ocr";

export const STUDENT_VIDEO_RESULT_SCHEMA_VERSION = "student-detail-video-result.v1";

export const studentVideoFieldNames = [
  "tier",
  "level",
  "weaponLevel",
  "abilityHp",
  "abilityAtk",
  "abilityHeal",
  "skillEx",
  "skillNormal",
  "skillEnhanced",
  "skillSub",
  "equip1",
  "equip2",
  "equip3",
  "equipSpecial",
  "relationshipRank",
] as const;

export type StudentVideoFieldName = (typeof studentVideoFieldNames)[number];
export type StudentVideoFieldState = "recognized" | "not_applicable" | "unknown" | "conflict";

export type StudentVideoFieldDetail = {
  state: StudentVideoFieldState;
  value: number | null;
  confidence: number;
  evidence: string[];
};

export type StudentDetailVideoStudent = {
  studentUid: string;
  studentName: string;
  fields: Record<StudentVideoFieldName, number | null>;
  fieldDetails: Record<StudentVideoFieldName, StudentVideoFieldDetail>;
  sourceFrames: number[];
  sourceTimestampsSeconds: number[];
  nameConfidence: number;
  reasons: string[];
};

export type StudentDetailVideoResult = {
  schemaVersion: 1;
  jobType: "student_detail_video_v1";
  executionProvider: "cpu" | "coreml";
  video: {
    filename: string;
    width: number;
    height: number;
    fps: number;
    frameCount: number;
    durationSeconds: number;
    candidateSegments: number;
    samplesPerSegment: number;
    recognizedObservations: number;
    codec?: string;
    container?: string;
  };
  students: StudentDetailVideoStudent[];
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

export function parseStudentDetailVideoEnvelope(
  envelope: OcrResultEnvelope,
): OcrResultEnvelope & { status: "succeeded"; result: StudentDetailVideoResult } {
  if (envelope.status !== "succeeded") {
    throw new OcrTaskResultRejectedError("성공한 학생 영상 결과가 필요해요");
  }
  if (envelope.schemaVersion !== STUDENT_VIDEO_RESULT_SCHEMA_VERSION) {
    throw new OcrTaskResultRejectedError("지원하지 않는 학생 영상 결과 schema예요");
  }
  return { ...envelope, result: parseStudentDetailVideoResult(envelope.result) };
}

export function parseStudentDetailVideoResult(value: unknown): StudentDetailVideoResult {
  const result = asRecord(value, "학생 영상 인식 결과");
  if (result.schemaVersion !== 1 || result.jobType !== "student_detail_video_v1") {
    throw new Error("지원하지 않는 학생 영상 결과 형식이에요");
  }
  if (result.executionProvider !== "cpu" && result.executionProvider !== "coreml") {
    throw new Error("학생 영상 실행 provider를 확인해주세요");
  }
  if (!Array.isArray(result.students)) {
    throw new Error("학생 영상 결과의 학생 목록을 확인해주세요");
  }

  const students = result.students.map(parseStudent);
  if (new Set(students.map(({ studentUid }) => studentUid)).size !== students.length) {
    throw new Error("학생 영상 결과에 같은 학생 UID가 두 번 포함되어 있어요");
  }

  return {
    schemaVersion: 1,
    jobType: "student_detail_video_v1",
    executionProvider: result.executionProvider,
    video: parseVideoMetadata(result.video),
    students,
    unresolvedCount: parseNonNegativeInteger(result.unresolvedCount, "미해결 필드 수"),
    elapsedMs: parseNonNegativeNumber(result.elapsedMs, "처리 시간"),
  };
}

export function getRecognizedStudentFields(
  student: StudentDetailVideoStudent,
): Partial<Record<StudentVideoFieldName, number>> {
  return Object.fromEntries(
    studentVideoFieldNames.flatMap((field) => {
      const detail = student.fieldDetails[field];
      return detail.state === "recognized" ? [[field, detail.value as number]] : [];
    }),
  );
}

function parseStudent(value: unknown): StudentDetailVideoStudent {
  const student = asRecord(value, "학생 인식 결과");
  const studentUid = parseNonEmptyString(student.studentUid, "학생 UID");
  const studentName = parseNonEmptyString(student.studentName, "학생 이름");
  const fieldsInput = asRecord(student.fields, "학생 필드");
  const detailsInput = asRecord(student.fieldDetails, "학생 필드 상세");
  const fields = {} as Record<StudentVideoFieldName, number | null>;
  const fieldDetails = {} as Record<StudentVideoFieldName, StudentVideoFieldDetail>;

  for (const field of studentVideoFieldNames) {
    const detail = parseFieldDetail(field, detailsInput[field]);
    const flatValue = parseNullableFieldValue(field, fieldsInput[field]);
    if (flatValue !== detail.value) {
      throw new Error(`${field}의 평면 값과 상세 값이 일치하지 않아요`);
    }
    fields[field] = flatValue;
    fieldDetails[field] = detail;
  }

  return {
    studentUid,
    studentName,
    fields,
    fieldDetails,
    sourceFrames: parseNumberArray(student.sourceFrames, "근거 프레임", true),
    sourceTimestampsSeconds: parseNumberArray(student.sourceTimestampsSeconds, "근거 시점", false),
    nameConfidence: parseConfidence(student.nameConfidence, "학생 이름 신뢰도"),
    reasons: parseStringArray(student.reasons, "학생 검토 사유"),
  };
}

function parseFieldDetail(field: StudentVideoFieldName, value: unknown): StudentVideoFieldDetail {
  const detail = asRecord(value, `${field} 상세`);
  if (
    detail.state !== "recognized" &&
    detail.state !== "not_applicable" &&
    detail.state !== "unknown" &&
    detail.state !== "conflict"
  ) {
    throw new Error(`${field} 상태를 확인해주세요`);
  }
  const parsedValue = parseNullableFieldValue(field, detail.value);
  if (detail.state === "recognized" && parsedValue === null) {
    throw new Error(`${field}의 recognized 값이 필요해요`);
  }
  if (detail.state !== "recognized" && parsedValue !== null) {
    throw new Error(`${field}의 판독 불가 값은 null이어야 해요`);
  }
  return {
    state: detail.state,
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

function parseVideoMetadata(value: unknown): StudentDetailVideoResult["video"] {
  const video = asRecord(value, "영상 메타데이터");
  const width = parsePositiveInteger(video.width, "영상 너비");
  const height = parsePositiveInteger(video.height, "영상 높이");
  const fps = parsePositiveNumber(video.fps, "영상 FPS");
  const frameCount = parsePositiveInteger(video.frameCount, "영상 프레임 수");
  const calculatedDuration = frameCount / fps;
  const durationSeconds =
    video.durationSeconds === undefined ? calculatedDuration : parsePositiveNumber(video.durationSeconds, "영상 길이");
  if (Math.abs(durationSeconds - calculatedDuration) > 1) {
    throw new Error("영상 길이와 프레임 메타데이터가 일치하지 않아요");
  }
  const codec = typeof video.codec === "string" ? video.codec.toLowerCase() : undefined;
  const container = typeof video.container === "string" ? video.container.toLowerCase() : undefined;
  if (codec && !["h264", "hevc", "av1", "mpeg4"].includes(codec)) {
    throw new Error("지원하지 않는 영상 codec이에요");
  }
  if (container && !OCR_ALLOWED_VIDEO_CONTAINERS.includes(container as (typeof OCR_ALLOWED_VIDEO_CONTAINERS)[number])) {
    throw new Error("지원하지 않는 영상 container예요");
  }

  return {
    filename: parseNonEmptyString(video.filename, "영상 파일명"),
    width,
    height,
    fps,
    frameCount,
    durationSeconds,
    candidateSegments: parseNonNegativeInteger(video.candidateSegments, "후보 구간 수"),
    samplesPerSegment: parsePositiveInteger(video.samplesPerSegment, "구간별 표본 수"),
    recognizedObservations: parseNonNegativeInteger(video.recognizedObservations, "인식 관측 수"),
    ...(codec ? { codec } : {}),
    ...(container ? { container } : {}),
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 형식을 확인해주세요`);
  }
  return value as Record<string, unknown>;
}

function parseNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}이(가) 필요해요`);
  return value.trim();
}

function parseStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} 형식을 확인해주세요`);
  }
  return value as string[];
}

function parseNumberArray(value: unknown, label: string, integer: boolean): number[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (item) => typeof item !== "number" || !Number.isFinite(item) || item < 0 || (integer && !Number.isInteger(item)),
    )
  ) {
    throw new Error(`${label} 형식을 확인해주세요`);
  }
  return value as number[];
}

function parseConfidence(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label}는 0부터 1 사이여야 해요`);
  }
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

function parsePositiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}을(를) 확인해주세요`);
  }
  return value;
}

function parseNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label}을(를) 확인해주세요`);
  }
  return value;
}
