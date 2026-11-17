import { buildRecruitTicketCards, type RecruitTicketCardsResult } from "~/domain/recruit-tickets";
import { nowUtcIso } from "~/lib/date-time";
import { getRecruitTicketSelections, getRecruitTicketSource } from "~/models/recruit-ticket";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { getAllStudents } from "~/models/student";

// The cards of the 모집권 tab. A signed-in Sensei's students that are not recruited yet are marked and listed first.
export async function getRecruitTicketsView(
  env: Env,
  senseiId: number | null,
  ctx?: ExecutionContext,
): Promise<RecruitTicketCardsResult> {
  const [source, students, selections, recruitedTiers] = await Promise.all([
    getRecruitTicketSource(env),
    getAllStudents(env, true),
    getRecruitTicketSelections(env, ctx),
    senseiId === null ? Promise.resolve(null) : getRecruitedStudentTiers(env, senseiId),
  ]);
  return buildRecruitTicketCards({
    source,
    students: new Map(
      students.map(({ uid, name, initialTier, order }) => [uid, { uid, name, initialTier, order }] as const),
    ),
    selections,
    recruitedStudentUids: recruitedTiers === null ? null : new Set(Object.keys(recruitedTiers)),
    now: nowUtcIso(),
  });
}
