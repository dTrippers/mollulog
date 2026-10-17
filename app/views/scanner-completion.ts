import {
  buildItemCompletionSummary,
  buildStudentCompletionSummary,
  type CellAddress,
  type ItemCompletionSummary,
  type StudentCompletionSummary,
} from "~/domain/scanner-completion";
import { getSyncDraft } from "~/models/sync-draft";

// The saved apply record is the source of the completion summary, so a reload shows the same values as the apply response.
// A missing record returns null, and the screen then shows an explicit unavailable state.
export async function loadItemCompletionSummary(
  env: Env,
  userId: number,
  draftUid: string,
  cells: readonly CellAddress[],
  catalog: Readonly<Record<string, { uid: string; type: string; name: string } | undefined>>,
): Promise<ItemCompletionSummary | null> {
  const saved = await getSyncDraft(env, userId, draftUid);
  if (!saved) return null;
  return buildItemCompletionSummary(saved.entries, cells, catalog);
}

export async function loadStudentCompletionSummary(
  env: Env,
  userId: number,
  draftUid: string,
  students: ReadonlyArray<{ studentUid: string }>,
  catalog: Readonly<Record<string, { name: string } | undefined>>,
): Promise<StudentCompletionSummary | null> {
  const saved = await getSyncDraft(env, userId, draftUid);
  if (!saved) return null;
  return buildStudentCompletionSummary(saved.entries, students, catalog);
}
