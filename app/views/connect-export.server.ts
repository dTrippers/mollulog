import { getRecruitedStudents } from "~/models/recruited-student";
import { getRelationshipLevels } from "~/models/relationship-level";
import { getAllStudents } from "~/models/student";
import { getStudentGrowths } from "~/models/student-growth";
import { listPendingSyncDrafts } from "~/models/sync-draft";

export async function getConnectExportData(env: Env, userId: number) {
  const [pendingDrafts, recruitedStudents, studentGrowths, relationshipLevels, allStudents] = await Promise.all([
    listPendingSyncDrafts(env, userId),
    getRecruitedStudents(env, userId),
    getStudentGrowths(env, userId),
    getRelationshipLevels(env, userId),
    getAllStudents(env, true),
  ]);

  const studentCatalog = Object.fromEntries(
    allStudents.map((student) => [student.uid, { name: student.name, order: student.order }]),
  );

  return {
    pendingDraftCount: pendingDrafts.length,
    recruitedStudents,
    studentGrowths,
    relationshipLevels,
    studentCatalog,
  };
}
