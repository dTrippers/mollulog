export const STUDENT_STATE_STALE_CODE = "STUDENT_STATE_STALE" as const;
export const STUDENT_STATE_STALE_MESSAGE =
  "페이지가 최신 상태가 아니라 저장하지 못했어요. 새로고침 후 다시 입력해 주세요.";

export class StaleStudentStateRequestError extends Error {
  readonly code = STUDENT_STATE_STALE_CODE;

  constructor() {
    super(STUDENT_STATE_STALE_MESSAGE);
    this.name = "StaleStudentStateRequestError";
  }
}

export function isStaleStudentStateRequestError(value: unknown): value is { code: typeof STUDENT_STATE_STALE_CODE } {
  return Boolean(value && typeof value === "object" && "code" in value && value.code === STUDENT_STATE_STALE_CODE);
}

export function isStaleStudentStateActionResult(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if ("code" in value && value.code === STUDENT_STATE_STALE_CODE) return true;
  if ("error" in value && isStaleStudentStateRequestError(value.error)) return true;
  return false;
}

export const STUDENT_STATE_MERGE_CONFLICT_MESSAGE = "다른 곳에서 값이 변경되었어요. 새로고침 후 다시 확인해주세요.";

/** Submitted student-state values no longer fit the stored values they are merged with at write time. */
export class StudentStateMergeConflictError extends Error {
  constructor() {
    super(STUDENT_STATE_MERGE_CONFLICT_MESSAGE);
    this.name = "StudentStateMergeConflictError";
  }
}
