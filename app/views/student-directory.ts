import { getRecruitedStudents } from "~/models/recruited-student";
import { getRelationshipLevels } from "~/models/relationship-level";
import type { StudentDirectoryPersonalRecord, StudentDirectoryPersonalState } from "~/domain/student-directory";
import type { StudentDirectoryStudent } from "~/models/student-directory";

export type StudentDirectoryPersonalSources = {
  getRecruitedStudents: typeof getRecruitedStudents;
  getRelationshipLevels: typeof getRelationshipLevels;
};

const defaultSources: StudentDirectoryPersonalSources = { getRecruitedStudents, getRelationshipLevels };

export async function loadStudentDirectoryPersonalState(
  env: Env,
  senseiId: number | null,
  students: StudentDirectoryStudent[],
  sources: StudentDirectoryPersonalSources = defaultSources,
): Promise<{ state: StudentDirectoryPersonalState; error?: unknown }> {
  if (senseiId === null) return { state: { status: "signed-out" } };
  const primaryUids = [
    ...new Set(
      students.flatMap((student) => {
        const uid = student.studentVariant?.primaryStudent.uid;
        return uid ? [uid] : [];
      }),
    ),
  ];
  try {
    const [recruitedStudents, relationshipLevels] = await Promise.all([
      sources.getRecruitedStudents(env, senseiId, primaryUids),
      sources.getRelationshipLevels(env, senseiId, primaryUids),
    ]);
    const recruitedByUid = new Map(recruitedStudents.map((student) => [student.studentUid, student]));
    const bondByUid = new Map(relationshipLevels.map((level) => [level.studentId, level.currentLevel]));
    const byPrimaryUid: Record<string, StudentDirectoryPersonalRecord> = {};
    for (const primaryUid of primaryUids) {
      const recruited = recruitedByUid.get(primaryUid);
      byPrimaryUid[primaryUid] = recruited
        ? {
            status: "recruited",
            tier: recruited.tier,
            level: recruited.level,
            bondLevel: bondByUid.get(primaryUid) ?? null,
          }
        : { status: "unrecruited", tier: null, level: null, bondLevel: null };
    }
    return { state: { status: "loaded", byPrimaryUid } };
  } catch (error) {
    return { state: { status: "failed" }, error };
  }
}
