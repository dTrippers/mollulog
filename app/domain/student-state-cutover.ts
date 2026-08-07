export const STUDENT_STATE_CUTOVER_MAINTENANCE_KEY = "mollu:student-state-cutover:maintenance";
export const STUDENT_STATE_MAINTENANCE_RETRY_AFTER_SECONDS = 30;

export type StudentStateMaintenanceResult = {
  kind: "studentStateMaintenance";
  code: "STUDENT_STATE_MAINTENANCE";
  message: string;
  retryAfterSeconds: number;
};

export const studentStateMaintenanceResult: StudentStateMaintenanceResult = {
  kind: "studentStateMaintenance",
  code: "STUDENT_STATE_MAINTENANCE",
  message: "학생 상태를 잠시 점검 중이에요. 잠시 후 다시 시도해주세요.",
  retryAfterSeconds: STUDENT_STATE_MAINTENANCE_RETRY_AFTER_SECONDS,
};

export function isStudentStateMaintenanceResult(value: unknown): value is StudentStateMaintenanceResult {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === studentStateMaintenanceResult.kind &&
    (value as { code?: unknown }).code === studentStateMaintenanceResult.code
  );
}

export function pyroxeneActionMutatesStudentState(
  method: string,
  payload: {
    createData?: { ownedResources?: { eventUid?: string | null; [key: string]: unknown }; [key: string]: unknown };
    deleteData?: {
      eventUid?: string | null;
      recruitmentGroupUid?: string | null;
      [key: string]: unknown;
    };
  },
): boolean {
  return method === "POST" && payload.createData?.ownedResources?.eventUid != null;
}
