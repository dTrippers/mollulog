import { rejectOcrApply } from "~/domain/ocr";
import { parseStudentDetailImagesResult, type StudentDetailImageStudent } from "~/domain/student-image-ocr";
import {
  parseStudentStateDraftValue,
  type StudentStateCurrentFieldKey,
  type StudentStateDraftCurrentValue,
  serializeStudentStateDraftValue,
  setStudentStateDraftFieldPresence,
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

type StudentGrowthStudent = StudentDetailVideoStudent | StudentDetailImageStudent;

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
    const valueJson = serializeStudentStateDraftValue(
      setStudentStateDraftFieldPresence({ current, target: null }, { current: confirmedFields, target: [] }),
    );
    return {
      entryKey: studentUid,
      value: current.tier,
      valueJson,
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

export function buildStudentImageSyncDraftEntries(
  rawResult: unknown,
  request: unknown,
  validStudentUids: ReadonlySet<string>,
): SyncDraftCreateInput["entries"] {
  const result = parseStudentDetailImagesResult(rawResult);
  const resultByUid = new Map(result.students.map((student) => [student.studentUid, student]));
  const students = parseApplyRequest(request, resultByUid, validStudentUids);

  return students.map(({ studentUid, current, confirmedFields }) => {
    const resultStudent = resultByUid.get(studentUid) as StudentDetailImageStudent;
    const valueJson = serializeStudentStateDraftValue(
      setStudentStateDraftFieldPresence({ current, target: null }, { current: confirmedFields, target: [] }),
    );
    return {
      entryKey: studentUid,
      value: current.tier,
      valueJson,
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
  resultByUid: ReadonlyMap<string, StudentGrowthStudent>,
  validStudentUids: ReadonlySet<string>,
): ParsedStudentApply[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { students?: unknown }).students)) {
    throw rejectOcrApply("반영할 학생을 선택해주세요", "students_missing");
  }
  const students = (value as { students: unknown[] }).students.map((student) =>
    parseApplyStudent(student, resultByUid, validStudentUids),
  );
  if (students.length === 0) throw rejectOcrApply("반영할 학생을 선택해주세요", "students_missing");
  if (new Set(students.map(({ studentUid }) => studentUid)).size !== students.length) {
    throw rejectOcrApply("같은 학생이 두 번 포함되어 있어요", "student_duplicated");
  }
  return students;
}

function parseApplyStudent(
  value: unknown,
  resultByUid: ReadonlyMap<string, StudentGrowthStudent>,
  validStudentUids: ReadonlySet<string>,
): ParsedStudentApply {
  if (!value || typeof value !== "object") throw rejectOcrApply("반영할 학생 정보를 확인해주세요", "student_invalid");
  const input = value as Record<string, unknown>;
  const studentUid = typeof input.studentUid === "string" ? input.studentUid.trim() : "";
  if (!studentUid || !resultByUid.has(studentUid)) {
    throw rejectOcrApply("인식 결과에 없는 학생은 반영할 수 없어요", "student_not_in_result");
  }
  if (!validStudentUids.has(studentUid)) {
    throw rejectOcrApply("현재 학생 목록에서 찾을 수 없는 학생은 반영할 수 없어요", "student_not_in_catalog");
  }
  if (!Array.isArray(input.confirmedFields)) {
    throw rejectOcrApply("승인할 학생 필드를 선택해주세요", "confirmed_fields_missing");
  }
  const confirmedFields = input.confirmedFields.map(parseConfirmedField);
  if (confirmedFields.length === 0 || !confirmedFields.includes("tier")) {
    throw rejectOcrApply("학생을 반영하려면 인식된 성급을 승인해주세요", "tier_not_confirmed", "tier");
  }
  const duplicatedField = confirmedFields.find((field, index) => confirmedFields.indexOf(field) !== index);
  if (duplicatedField) {
    throw rejectOcrApply("같은 학생 필드가 두 번 포함되어 있어요", "confirmed_field_duplicated", duplicatedField);
  }

  const submitted = asRecord(input.current, "학생 현재 성장도", "current");
  const resultStudent = resultByUid.get(studentUid) as StudentGrowthStudent;
  const current = createEmptyCurrent(parseSubmittedInteger(submitted.tier, "성급", "tier"));
  for (const field of confirmedFields) {
    const resultField = toResultField(field);
    if (resultStudent.fieldDetails[resultField].state === "not_applicable") {
      throw rejectOcrApply(`${field}은(는) 미장착 상태라 반영할 수 없어요`, "field_not_equipped", field);
    }
    current[field] = parseSubmittedInteger(submitted[field], field, field);
  }

  if (!fitsGrowthRules(current)) {
    throw rejectOcrApply(
      "학생 성장도 값이 현재 성장 규칙에 맞지 않아요",
      "growth_rule_violation",
      findGrowthRuleViolationField(current, confirmedFields),
    );
  }
  return { studentUid, current, confirmedFields };
}

function fitsGrowthRules(current: StudentStateDraftCurrentValue): boolean {
  try {
    parseStudentStateDraftValue({
      value: current.tier,
      valueJson: JSON.stringify({ current, target: null }),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Names the first confirmed field whose value breaks the growth rules, adding fields one at a time over the tier.
 * Rules that compare a field with the tier are attributed to that field, not to the tier.
 */
function findGrowthRuleViolationField(
  current: StudentStateDraftCurrentValue,
  confirmedFields: readonly StudentVideoApplyFieldName[],
): StudentVideoApplyFieldName | undefined {
  const partial = createEmptyCurrent(current.tier);
  if (!fitsGrowthRules(partial)) return "tier";
  for (const field of confirmedFields) {
    if (field === "tier") continue;
    partial[field] = current[field];
    if (!fitsGrowthRules(partial)) return field;
  }
  return undefined;
}

function parseConfirmedField(value: unknown): StudentVideoApplyFieldName {
  if (typeof value !== "string" || !studentVideoApplyFieldNames.includes(value as StudentVideoApplyFieldName)) {
    throw rejectOcrApply("반영할 수 없는 학생 항목이 포함되어 있어요", "confirmed_field_unknown");
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

function parseSubmittedInteger(value: unknown, label: string, field: StudentVideoApplyFieldName): number {
  if (!Number.isInteger(value)) throw rejectOcrApply(`${label} 값은 정수여야 해요`, "field_value_not_integer", field);
  return value as number;
}

function asRecord(value: unknown, label: string, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw rejectOcrApply(`${label} 형식을 확인해주세요`, "current_state_invalid", field);
  }
  return value as Record<string, unknown>;
}
