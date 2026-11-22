import type { RecruitmentPlanCheckEvent } from "~/domain/pyroxene-recruitment-plan-check";
import type { MemberSnapshot, MemberSnapshotRecruitmentCheck } from "~/models/al1s-question-contract";
import { buildQuestionMemberSnapshot } from "~/models/question-member-snapshot.server";
import { getRecruitmentPlanCheck, type RecruitmentPlanCheckResult } from "~/views/recruitment-plan-check";

function mapCheckEvent(
  event: RecruitmentPlanCheckEvent,
): Extract<MemberSnapshotRecruitmentCheck, { status: "available" }>["events"][number] {
  return {
    plannerEventUid: event.eventUid,
    eventName: event.name,
    startAt: event.since,
    endAt: event.until,
    basis: event.basis,
    pulls: event.pulls,
    pullRange: event.pullRange,
    freePulls: event.freePulls,
    pyroxeneBefore: event.pyroxeneBefore,
    pyroxeneBeforeRange: event.pyroxeneBeforeRange,
    spent: { ...event.spent },
    pyroxeneAfter: event.pyroxeneAfter,
    pyroxeneAfterRange: event.pyroxeneAfterRange,
    shortfall: event.shortfall,
    surplus: event.surplus,
    status: event.status,
    ownedApplied: event.ownedApplied,
    targets: event.targets.map(({ studentUid, targetTier, owned, remainingEleph, copies }) => ({
      studentUid,
      targetTier,
      owned: owned ? { tier: owned.tier, eleph: owned.eleph } : null,
      remainingEleph,
      copies,
    })),
  };
}

/** The check as AL-1S receives it; a failure carries no internal stage. */
export function mapQuestionSnapshotRecruitmentCheck(
  result: RecruitmentPlanCheckResult,
): MemberSnapshotRecruitmentCheck {
  if (result.status === "input_required") return { status: "input_required" };
  if (result.status === "failed") return { status: "failed" };
  return {
    status: "available",
    resourcesInputAt: result.resourcesInputAt,
    events: result.events.map(mapCheckEvent),
  };
}

/** The member snapshot for one question, with the recruitment plan check the planner screen would show. */
export async function getQuestionMemberSnapshot(
  env: Env,
  senseiId: number,
  now: Date,
  ctx?: ExecutionContext,
): Promise<MemberSnapshot> {
  const [snapshot, recruitmentCheck] = await Promise.all([
    buildQuestionMemberSnapshot(env, senseiId),
    getRecruitmentPlanCheck(env, senseiId, now, ctx),
  ]);
  return { ...snapshot, recruitmentCheck: mapQuestionSnapshotRecruitmentCheck(recruitmentCheck) };
}
