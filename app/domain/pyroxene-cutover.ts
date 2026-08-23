export const D1_CUTOVER_MAINTENANCE_KEY = "mollu:d1-cutover:maintenance";
export const D1_MAINTENANCE_RETRY_AFTER_SECONDS = 30;

export type D1MaintenanceResult = {
  kind: "d1Maintenance";
  code: "D1_MAINTENANCE";
  message: string;
  retryAfterSeconds: number;
};

export const d1MaintenanceResult: D1MaintenanceResult = {
  kind: "d1Maintenance",
  code: "D1_MAINTENANCE",
  message: "저장 기능을 잠시 점검 중이에요. 잠시 후 다시 시도해주세요.",
  retryAfterSeconds: D1_MAINTENANCE_RETRY_AFTER_SECONDS,
};

export function isD1MaintenanceResult(value: unknown): value is D1MaintenanceResult {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === d1MaintenanceResult.kind &&
    (value as { code?: unknown }).code === d1MaintenanceResult.code
  );
}

/** Maps a guarded mutation response to the user-facing notice, if present. */
export function d1MaintenanceMessage(value: unknown): string | null {
  return isD1MaintenanceResult(value) ? value.message : null;
}
