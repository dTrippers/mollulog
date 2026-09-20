import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { captureServerError, getLogger } from "~/lib/observability.server";
import type { NestedComment } from "~/models/content";
import {
  createComment,
  createSubcomment,
  deleteComment,
  getContentRecruitmentPeriod,
  getNestedContentComments,
  pinComment,
  unpinComment,
  updateComment,
} from "~/models/content.server";
import { classifyAndPersistRecruitmentOpinion } from "~/models/recruitment-opinion-classifier.server";

export type CommentResponse = {
  comments: NestedComment[];
  unavailable: boolean;
};

async function getCommentsResponse(
  env: Env,
  contentUid: string,
  currentUser: Awaited<ReturnType<typeof getActiveSensei>>,
  ctx: ExecutionContext,
): Promise<CommentResponse> {
  const logger = getLogger(env, ctx, { route: "api.contents.comments", contentUid });
  const hideRecruitmentOpinions = currentUser?.hideRecruitmentOpinions === true;
  const recruitmentPeriod = await getContentRecruitmentPeriod(env, contentUid, { ctx });
  const options = {
    hideRecruitmentOpinions,
    recruitmentPeriodStartAtByContentId: { [contentUid]: recruitmentPeriod?.startAt ?? null },
    ctx,
  };
  try {
    return { comments: await getNestedContentComments(env, contentUid, currentUser, options), unavailable: false };
  } catch (error) {
    const errorContext = {
      route: "api.contents.comments",
      operation: "comments",
      contentUid,
      signedIn: currentUser !== null,
    };
    logger.error("Failed to load content comments", error, errorContext);
    captureServerError(error, errorContext);
    return { comments: [], unavailable: true };
  }
}

export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const contentUid = params.uid;
  if (!contentUid) {
    throw new Response("Content UID is required", { status: 400 });
  }

  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);
  return getCommentsResponse(env, contentUid, currentUser, ctx);
};

export type ActionData = {
  action: "create" | "createSubcomment" | "update" | "delete" | "pin" | "unpin";
  body?: string;
  visibility?: "private" | "public";
  parentCommentUid?: string;
  commentUid?: string;
};

export const action = async ({ request, params, context }: ActionFunctionArgs) => {
  const contentUid = params.uid;
  if (!contentUid) {
    throw new Response("Content UID is required", { status: 400 });
  }

  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const actionData = await request.json<ActionData>();
  const recruitmentPeriod = await getContentRecruitmentPeriod(env, contentUid, { ctx });
  const commentOptions = { recruitmentPeriodStartAt: recruitmentPeriod?.startAt ?? null, ctx };
  if (actionData.action === "create") {
    if (!actionData.body) {
      throw new Response("Body is required", { status: 400 });
    }
    const commentUid = await createComment(
      env,
      currentUser.id,
      contentUid,
      actionData.body,
      actionData.visibility ?? "private",
      commentOptions,
    );
    if (recruitmentPeriod && Date.now() >= new Date(recruitmentPeriod.startAt).getTime()) {
      ctx.waitUntil(
        classifyAndPersistRecruitmentOpinion(env, { postUid: commentUid, body: actionData.body, revision: 0 }, ctx),
      );
    }
  } else if (actionData.action === "createSubcomment") {
    if (!actionData.body || !actionData.parentCommentUid) {
      throw new Response("Body and parentCommentUid are required", { status: 400 });
    }
    await createSubcomment(
      env,
      currentUser.id,
      contentUid,
      actionData.parentCommentUid,
      actionData.body,
      actionData.visibility ?? "private",
      commentOptions,
    );
  } else if (actionData.action === "update") {
    if (!actionData.commentUid || !actionData.body) {
      throw new Response("CommentUid and body are required", { status: 400 });
    }
    const classificationJob = await updateComment(
      env,
      currentUser.id,
      actionData.commentUid,
      actionData.body,
      actionData.visibility ?? "private",
      commentOptions,
    );
    if (classificationJob) {
      ctx.waitUntil(classifyAndPersistRecruitmentOpinion(env, classificationJob, ctx));
    }
  } else if (actionData.action === "delete") {
    if (!actionData.commentUid) {
      throw new Response("CommentUid is required", { status: 400 });
    }
    await deleteComment(env, currentUser.id, actionData.commentUid);
  } else if (actionData.action === "pin") {
    if (!actionData.commentUid) {
      throw new Response("CommentUid is required", { status: 400 });
    }
    await pinComment(env, currentUser.id, contentUid, actionData.commentUid);
  } else if (actionData.action === "unpin") {
    await unpinComment(env, currentUser.id, contentUid);
  } else {
    throw new Response("Invalid action", { status: 400 });
  }

  // Return updated comments
  return getCommentsResponse(env, contentUid, currentUser, ctx);
};
