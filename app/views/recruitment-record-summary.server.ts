import { type RecruitmentRecordSummary, summarizeRecruitmentRecords } from "~/domain/recruitment-record-summary";
import { isRecordedRecruitmentResult } from "~/domain/recruitment-result";
import { getRecruitmentGroupsByUids, getRecruitmentPoolStudents } from "~/models/recruitment";
import { getRecruitmentResults } from "~/models/recruitment-result.server";
import { getAllStudentsMap } from "~/models/student";

// The profile's recruitment record totals. Unlike the record list, a record whose event or student cannot be resolved
// is still counted from what the record stored, so the profile never fails on one broken row. A failure to load the
// records themselves throws and the caller shows a failure state.
export async function getRecruitmentRecordSummary(env: Env, userId: number): Promise<RecruitmentRecordSummary> {
  const results = (await getRecruitmentResults(env, userId)).filter(isRecordedRecruitmentResult);
  if (results.length === 0) {
    return summarizeRecruitmentRecords([], () => ({}));
  }

  const [groups, poolStudents, allStudentsMap] = await Promise.all([
    getRecruitmentGroupsByUids(
      env,
      results.map((result) => result.recruitmentGroupUid),
    ),
    getRecruitmentPoolStudents(env),
    getAllStudentsMap(env, true),
  ]);
  const groupMap = new Map(groups.map((group) => [group.uid, group] as const));
  const poolStudentsMap = new Map(poolStudents.map((student) => [student.uid, student] as const));

  return summarizeRecruitmentRecords(results, (result) => ({
    allStudentsMap,
    poolStudentsMap,
    group: groupMap.get(result.recruitmentGroupUid),
  }));
}
