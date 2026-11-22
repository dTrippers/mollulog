import {
  buildPlannerEventDataMap,
  buildRecruitmentPlanCheck,
  type RecruitmentPlanCheck,
  toPyroxeneCalculationOptions,
} from "~/domain/pyroxene-recruitment-plan-check";
import { buildPyroxeneScheduleItems } from "~/domain/pyroxene-schedule";
import { getLogger } from "~/lib/observability.server";
import { getPyroxenePlannerContents } from "~/views/pyroxene";
import { loadPyroxenePlannerAccount } from "~/views/pyroxene-planner-account";

/** The check, or a failure to read the planner data (`load`) or to calculate the timeline (`calculation`). */
export type RecruitmentPlanCheckResult = RecruitmentPlanCheck | { status: "failed"; stage: "load" | "calculation" };

/**
 * Checks the signed-in account's recruitment plan with the same data and calculation as the pyroxene planner
 * screen, so both report the same numbers.
 */
export async function getRecruitmentPlanCheck(
  env: Env,
  userId: number,
  now: Date,
  ctx?: ExecutionContext,
): Promise<RecruitmentPlanCheckResult> {
  const logger = getLogger(env, ctx, { route: "recruitment_plan_check" });

  let contents: Awaited<ReturnType<typeof getPyroxenePlannerContents>>;
  let account: Awaited<ReturnType<typeof loadPyroxenePlannerAccount>>;
  try {
    contents = await getPyroxenePlannerContents(env, false, ctx);
    account = await loadPyroxenePlannerAccount(env, userId, contents, ctx);
  } catch (error) {
    logger.error("Failed to load the recruitment plan check data", error);
    return { status: "failed", stage: "load" };
  }

  try {
    return buildRecruitmentPlanCheck({
      now,
      resources: account.latestResources,
      eventDataMap: buildPlannerEventDataMap(account.eventData, account.recruitmentResultCompletions),
      scheduleItems: buildPyroxeneScheduleItems(contents, account.favoritedStudents, account.timelineItems),
      options: toPyroxeneCalculationOptions(account.calcOptions),
      collectedSourceKeys: account.collectedSourceKeys,
      ownedSnapshot: account.recruitmentOwnedSnapshot,
    });
  } catch (error) {
    logger.error("Failed to calculate the recruitment plan check", error);
    return { status: "failed", stage: "calculation" };
  }
}
