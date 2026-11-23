import { type ActionFunctionArgs, data, type LoaderFunctionArgs } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { isRecruitGoal, type RecruitGoal } from "~/domain/recruit-recommendation";
import { captureServerError, getLogger } from "~/lib/observability.server";
import { getRecruitGoal, setRecruitGoal } from "~/models/recruit-recommendation-profile";
import { getFutureContents } from "~/views/futures";
import { loadRecruitRecommendations, type RecruitRecommendationView } from "~/views/recruit-recommendations.server";

export type RecruitRecommendationsLoaderData =
  | (Extract<RecruitRecommendationView, { status: "ok" }> & { goal: RecruitGoal })
  | { status: "no_goal" }
  | { status: "unavailable" };

export type RecruitGoalActionData = { ok: true; goal: RecruitGoal } | { ok: false };

/**
 * The recommendations for a goal: the `goal` parameter, or for a signed-in user without one, the saved goal. A guest
 * keeps the goal in the browser and always sends it.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare;
  const ctx: ExecutionContext = context.cloudflare.ctx;
  const logger = getLogger(env, ctx, { route: "api.recruit-recommendations.loader" });
  const report = (error: unknown, operation: string) => {
    const errorContext = { route: "api.recruit-recommendations.loader", operation };
    logger.error("Failed to load recruit recommendations", error, errorContext);
    captureServerError(error, errorContext);
  };
  const requestedGoal = new URL(request.url).searchParams.get("goal");
  if (requestedGoal !== null && !isRecruitGoal(requestedGoal)) {
    return data<RecruitRecommendationsLoaderData>({ status: "unavailable" }, { status: 400 });
  }

  try {
    const sensei = await getActiveSensei(env, request, ctx);
    const goal = requestedGoal ?? (sensei ? await getRecruitGoal(env, sensei.id, { ctx }) : null);
    if (goal === null) return data<RecruitRecommendationsLoaderData>({ status: "no_goal" });
    const contents = await getFutureContents(env, false, ctx);
    const view = await loadRecruitRecommendations(env, {
      goal,
      userId: sensei?.id ?? null,
      contents,
      onRecruitedReadFailure: (error) => report(error, "recruited_students"),
      onUnknownSubstitute: (studentUid) =>
        report(new Error(`A substitute tag points at an unknown student ${studentUid}.`), "substitute_names"),
    });
    if (view.status !== "ok") {
      report(new Error("The recommendation service gave no answer."), "recommendation_service");
      return data<RecruitRecommendationsLoaderData>({ status: "unavailable" }, { status: 503 });
    }
    return data<RecruitRecommendationsLoaderData>({ ...view, goal });
  } catch (error) {
    report(error, "load");
    return data<RecruitRecommendationsLoaderData>({ status: "unavailable" }, { status: 503 });
  }
}

/** Saves a signed-in user's goal. */
export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.cloudflare;
  const ctx: ExecutionContext = context.cloudflare.ctx;
  if (request.method !== "POST") return data<RecruitGoalActionData>({ ok: false }, { status: 405 });
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return data<RecruitGoalActionData>({ ok: false }, { status: 401 });
  let goal: unknown;
  try {
    goal = ((await request.json()) as { goal?: unknown } | null)?.goal;
  } catch {
    return data<RecruitGoalActionData>({ ok: false }, { status: 400 });
  }
  if (!isRecruitGoal(goal)) return data<RecruitGoalActionData>({ ok: false }, { status: 400 });
  try {
    await setRecruitGoal(env, sensei.id, goal, { ctx });
  } catch (error) {
    const errorContext = { route: "api.recruit-recommendations.action", operation: "set_goal" };
    getLogger(env, ctx, errorContext).error("Failed to save recruit goal", error, errorContext);
    captureServerError(error, errorContext);
    return data<RecruitGoalActionData>({ ok: false }, { status: 500 });
  }
  return data<RecruitGoalActionData>({ ok: true, goal });
}
