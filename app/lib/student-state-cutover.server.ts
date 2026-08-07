import { data } from "react-router";
import {
  isStudentStateMaintenanceResult,
  STUDENT_STATE_CUTOVER_MAINTENANCE_KEY,
  STUDENT_STATE_MAINTENANCE_RETRY_AFTER_SECONDS,
  studentStateMaintenanceResult,
} from "~/domain/student-state-cutover";
import { getLogger } from "~/lib/observability.server";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { withTimeout } from "~/lib/with-timeout";

export type { StudentStateMaintenanceResult } from "~/domain/student-state-cutover";
export { isStudentStateMaintenanceResult, studentStateMaintenanceResult };

type StudentStateMaintenanceLogger = Pick<ReturnType<typeof getLogger>, "error">;

export type StudentStateMaintenanceOptions = {
  ctx?: ExecutionContext;
  logger?: StudentStateMaintenanceLogger;
  operation?: string;
};

async function isStudentStateWriteFrozen(
  env: Pick<Env, "KV_CACHE">,
  options: StudentStateMaintenanceOptions = {},
): Promise<boolean> {
  try {
    const value = await withTimeout(
      env.KV_CACHE.get(STUDENT_STATE_CUTOVER_MAINTENANCE_KEY),
      RUNTIME_TIMEOUTS.kv.operation,
      "student-state-cutover.kv.get",
    );
    return value !== null;
  } catch (error) {
    const operation = options.operation ?? "student-state-cutover";
    const logger = options.logger ?? getLogger(env as Env, options.ctx, { operation });
    logger.error("Student-state maintenance KV read failed; failing closed", error, {
      key: STUDENT_STATE_CUTOVER_MAINTENANCE_KEY,
      operation,
    });
    return true;
  }
}

/** Return the typed action result when a targeted student-state write is frozen. */
export async function studentStateMaintenanceActionResult(env: Env, options: StudentStateMaintenanceOptions = {}) {
  if (!(await isStudentStateWriteFrozen(env, options))) return null;
  return data(studentStateMaintenanceResult, {
    status: 503,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(STUDENT_STATE_MAINTENANCE_RETRY_AFTER_SECONDS),
      "Cache-Control": "no-store",
    },
  });
}
