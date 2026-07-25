import { OcrPublicError } from "~/domain/ocr";
import {
  parseStudentStateDraftValue,
  type StudentStateCurrentFieldKey,
  type StudentStateDraftCurrentValue,
} from "~/domain/student-state";
import {
  parseStudentDetailVideoResult,
  type StudentDetailVideoStudent,
  type StudentVideoFieldName,
} from "~/domain/student-video-ocr";
import type { SyncDraftCreateInput } from "~/models/sync-draft";

export const studentVideoApplyFieldNames = [
  "tier",
  "bond",
  "level",
  "weaponLevel",
  "skillEx",
  "skillNormal",
  "skillEnhanced",
  "skillSub",
  "equip1",
  "equip2",
  "equip3",
  "equipSpecial",
  "abilityHp",
  "abilityAtk",
  "abilityHeal",
] as const satisfies readonly StudentStateCurrentFieldKey[];

export type StudentVideoApplyFieldName = (typeof studentVideoApplyFieldNames)[number];

type ParsedStudentApply = {
  studentUid: string;
  current: StudentStateDraftCurrentValue;
  confirmedFields: StudentVideoApplyFieldName[];
};

export function buildStudentVideoSyncDraftEntries(
  rawResult: unknown,
  request: unknown,
  validStudentUids: ReadonlySet<string>,
): SyncDraftCreateInput["entries"] {
  const result = parseStudentDetailVideoResult(rawResult);
  const resultByUid = new Map(result.students.map((student) => [student.studentUid, student]));
  const students = parseApplyRequest(request, resultByUid, validStudentUids);

  return students.map(({ studentUid, current, confirmedFields }) => {
    const resultStudent = resultByUid.get(studentUid) as StudentDetailVideoStudent;
    return {
      entryKey: studentUid,
      value: current.tier,
      valueJson: JSON.stringify({ current, target: null }),
      meta: {
        confirmedFields,
        fields: Object.fromEntries(
          confirmedFields.map((field) => {
            const resultField = toResultField(field);
            const detail = resultStudent.fieldDetails[resultField];
            const submittedValue = current[field];
            return [
              field,
              {
                ocrValue: detail.value,
                submittedValue,
                confidence: detail.confidence,
                corrected: submittedValue !== detail.value,
              },
            ];
          }),
        ),
      },
    };
  });
}

function parseApplyRequest(
  value: unknown,
  resultByUid: ReadonlyMap<string, StudentDetailVideoStudent>,
  validStudentUids: ReadonlySet<string>,
): ParsedStudentApply[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { students?: unknown }).students)) {
    throw new OcrPublicError("반영할 학생을 선택해주세요");
  }
  const students = (value as { students: unknown[] }).students.map((student) =>
    parseApplyStudent(student, resultByUid, validStudentUids),
  );
  if (students.length === 0) throw new OcrPublicError("반영할 학생을 선택해주세요");
  if (new Set(students.map(({ studentUid }) => studentUid)).size !== students.length) {
    throw new OcrPublicError("같은 학생이 두 번 포함되어 있어요");
  }
  return students;
}

function parseApplyStudent(
  value: unknown,
  resultByUid: ReadonlyMap<string, StudentDetailVideoStudent>,
  validStudentUids: ReadonlySet<string>,
): ParsedStudentApply {
  if (!value || typeof value !== "object") throw new OcrPublicError("반영할 학생 정보를 확인해주세요");
  const input = value as Record<string, unknown>;
  const studentUid = typeof input.studentUid === "string" ? input.studentUid.trim() : "";
  if (!studentUid || !resultByUid.has(studentUid)) {
    throw new OcrPublicError("인식 결과에 없는 학생은 반영할 수 없어요");
  }
  if (!validStudentUids.has(studentUid)) {
    throw new OcrPublicError("현재 학생 목록에서 찾을 수 없는 학생은 반영할 수 없어요");
  }
  if (!Array.isArray(input.confirmedFields)) throw new OcrPublicError("승인할 학생 필드를 선택해주세요");
  const confirmedFields = input.confirmedFields.map(parseConfirmedField);
  if (confirmedFields.length === 0 || !confirmedFields.includes("tier")) {
    throw new OcrPublicError("학생을 반영하려면 인식된 성급을 승인해주세요");
  }
  if (new Set(confirmedFields).size !== confirmedFields.length) {
    throw new OcrPublicError("같은 학생 필드가 두 번 포함되어 있어요");
  }

  const submitted = asRecord(input.current, "학생 현재 성장도");
  const resultStudent = resultByUid.get(studentUid) as StudentDetailVideoStudent;
  const current = createEmptyCurrent(parseSubmittedInteger(submitted.tier, "성급"));
  for (const field of confirmedFields) {
    const resultField = toResultField(field);
    if (resultStudent.fieldDetails[resultField].state === "not_applicable") {
      throw new OcrPublicError(`${field}은(는) 미장착 상태라 반영할 수 없어요`);
    }
    current[field] = parseSubmittedInteger(submitted[field], field);
  }

  try {
    parseStudentStateDraftValue({
      value: current.tier,
      valueJson: JSON.stringify({ current, target: null }),
    });
  } catch {
    throw new OcrPublicError("학생 성장도 값이 현재 성장 규칙에 맞지 않아요");
  }
  return { studentUid, current, confirmedFields };
}

function parseConfirmedField(value: unknown): StudentVideoApplyFieldName {
  if (typeof value !== "string" || !studentVideoApplyFieldNames.includes(value as StudentVideoApplyFieldName)) {
    throw new OcrPublicError("반영할 수 없는 학생 항목이 포함되어 있어요");
  }
  return value as StudentVideoApplyFieldName;
}

function toResultField(field: StudentVideoApplyFieldName): StudentVideoFieldName {
  return field === "bond" ? "relationshipRank" : field;
}

function createEmptyCurrent(tier: number): StudentStateDraftCurrentValue {
  return {
    tier,
    bond: null,
    level: null,
    weaponLevel: null,
    skillEx: null,
    skillNormal: null,
    skillEnhanced: null,
    skillSub: null,
    equip1: null,
    equip2: null,
    equip3: null,
    equipSpecial: null,
    abilityHp: null,
    abilityAtk: null,
    abilityHeal: null,
  };
}

function parseSubmittedInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value)) throw new OcrPublicError(`${label} 값은 정수여야 해요`);
  return value as number;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OcrPublicError(`${label} 형식을 확인해주세요`);
  }
  return value as Record<string, unknown>;
}
