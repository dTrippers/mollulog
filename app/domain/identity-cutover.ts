export const IDENTITY_CUTOVER_MAINTENANCE_KEY = "mollu:identity-cutover:maintenance";
export const IDENTITY_MAINTENANCE_RETRY_AFTER_SECONDS = 30;

export type IdentityMaintenanceResult = {
  kind: "identityMaintenance";
  code: "IDENTITY_MAINTENANCE";
  message: string;
  retryAfterSeconds: number;
};

export const identityMaintenanceResult: IdentityMaintenanceResult = {
  kind: "identityMaintenance",
  code: "IDENTITY_MAINTENANCE",
  message: "로그인과 계정 변경을 잠시 점검 중이에요. 잠시 후 다시 시도해주세요.",
  retryAfterSeconds: IDENTITY_MAINTENANCE_RETRY_AFTER_SECONDS,
};

export function isIdentityMaintenanceResult(value: unknown): value is IdentityMaintenanceResult {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === identityMaintenanceResult.kind &&
    (value as { code?: unknown }).code === identityMaintenanceResult.code
  );
}

/** Maps a guarded mutation response to the user-facing notice, if present. */
export function identityMaintenanceMessage(value: unknown): string | null {
  return isIdentityMaintenanceResult(value) ? value.message : null;
}
