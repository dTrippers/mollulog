import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  getPostgresWalkthroughTimelineLikeSummaries,
  setPostgresWalkthroughTimelineLike,
} from "~/db/postgres/walkthrough-timeline-likes";
import { getPostgresWalkthroughTimeline } from "~/db/postgres/walkthrough-timelines";
import type { LikeChangedActionResult } from "~/domain/like";
import { getSenseiById, isSenseiProfileVisibleTo } from "~/models/sensei";

async function requireVisibleTimeline(env: Env, ctx: ExecutionContext, walkthroughUid: string, viewerUserId?: number) {
  const timeline = await getPostgresWalkthroughTimeline(env, walkthroughUid, { ctx });
  const author = timeline ? await getSenseiById(env, timeline.userId) : null;
  if (
    !timeline ||
    !author ||
    (timeline.visibility === "private" && timeline.userId !== viewerUserId) ||
    !isSenseiProfileVisibleTo(author, viewerUserId)
  ) {
    throw new Response("Walkthrough not found", { status: 404 });
  }
}

export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const walkthroughUid = params.uid;
  if (!walkthroughUid) throw new Response("Walkthrough UID is required", { status: 400 });

  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request);
  await requireVisibleTimeline(env, ctx, walkthroughUid, currentUser?.id);
  const summaries = await getPostgresWalkthroughTimelineLikeSummaries(env, [walkthroughUid], currentUser?.id, { ctx });
  return summaries[walkthroughUid] ?? { liked: false, likeCount: 0 };
};

type ActionData = {
  liked: boolean;
};

export const action = async ({ request, params, context }: ActionFunctionArgs) => {
  const walkthroughUid = params.uid;
  if (!walkthroughUid) throw new Response("Walkthrough UID is required", { status: 400 });

  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) return redirect("/unauthorized");
  await requireVisibleTimeline(env, ctx, walkthroughUid, currentUser.id);

  const actionData = await request.json<ActionData>();
  const updated = await setPostgresWalkthroughTimelineLike(env, walkthroughUid, currentUser.id, actionData.liked, {
    ctx,
  });
  if (!updated) throw new Response("Walkthrough not found", { status: 404 });

  const summaries = await getPostgresWalkthroughTimelineLikeSummaries(env, [walkthroughUid], currentUser.id, { ctx });
  const summary = summaries[walkthroughUid] ?? { liked: false, likeCount: 0 };
  return {
    kind: "likeChanged",
    targetUid: walkthroughUid,
    ...summary,
  } satisfies LikeChangedActionResult;
};
