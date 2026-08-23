export const PYROXENE_CUTOVER_MAINTENANCE_KEY = "mollu:pyroxene-cutover:maintenance";
export const PYROXENE_MAINTENANCE_RETRY_AFTER_SECONDS = 30;

export type PyroxeneMaintenanceResult = {
  kind: "pyroxeneMaintenance";
  code: "PYROXENE_MAINTENANCE";
  message: string;
  retryAfterSeconds: number;
};

export const pyroxeneMaintenanceResult: PyroxeneMaintenanceResult = {
  kind: "pyroxeneMaintenance",
  code: "PYROXENE_MAINTENANCE",
  message: "청휘석 플래너 저장을 잠시 점검 중이에요. 잠시 후 다시 시도해주세요.",
  retryAfterSeconds: PYROXENE_MAINTENANCE_RETRY_AFTER_SECONDS,
};

export function isPyroxeneMaintenanceResult(value: unknown): value is PyroxeneMaintenanceResult {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === pyroxeneMaintenanceResult.kind &&
    (value as { code?: unknown }).code === pyroxeneMaintenanceResult.code
  );
}

/** Maps a guarded mutation response to the user-facing notice, if present. */
export function pyroxeneMaintenanceMessage(value: unknown): string | null {
  return isPyroxeneMaintenanceResult(value) ? value.message : null;
}
