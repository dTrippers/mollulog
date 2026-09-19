import { getPostgresPublishedStudentSummary } from "~/db/postgres/student-summary";
import type { StudentSummary } from "./student-summary";

export type { StudentSummary } from "./student-summary";

export async function getPublishedStudentSummary(
  env: Env,
  studentUid: string,
  options: { ctx?: ExecutionContext } = {},
): Promise<StudentSummary | null> {
  return getPostgresPublishedStudentSummary(env, studentUid, options);
}
