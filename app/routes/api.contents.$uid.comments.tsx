import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { communityWriteMaintenanceResponse, isCommunityWriteFrozen } from "~/lib/community-write-freeze.server";
import { withD1Session } from "~/lib/d1-session";
import { nestComments } from "~/models/content";
import {
  createComment,
  createSubcomment,
  deleteComment,
  getContentComments,
  getNestedContentComments,
  pinComment,
  unpinComment,
  updateComment,
} from "~/models/content.server";

export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const contentUid = params.uid;
  if (!contentUid) {
    throw new Response("Content UID is required", { status: 400 });
  }

  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  const sessionEnv = withD1Session(env, currentUser ? "first-primary" : "first-unconstrained");
  return nestComments(await getContentComments(sessionEnv, contentUid, currentUser?.id), currentUser);
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
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const actionData = await request.json<ActionData>();
  if (actionData.action === "create") {
    if (!actionData.body) {
      throw new Response("Body is required", { status: 400 });
    }
    if (await isCommunityWriteFrozen(env, { ctx, operation: "content-comment.create" })) {
      return communityWriteMaintenanceResponse();
    }
    await createComment(env, currentUser.id, contentUid, actionData.body, actionData.visibility ?? "private");
  } else if (actionData.action === "createSubcomment") {
    if (!actionData.body || !actionData.parentCommentUid) {
      throw new Response("Body and parentCommentUid are required", { status: 400 });
    }
    if (await isCommunityWriteFrozen(env, { ctx, operation: "content-comment.create-subcomment" })) {
      return communityWriteMaintenanceResponse();
    }
    await createSubcomment(
      env,
      currentUser.id,
      contentUid,
      actionData.parentCommentUid,
      actionData.body,
      actionData.visibility ?? "private",
    );
  } else if (actionData.action === "update") {
    if (!actionData.commentUid || !actionData.body) {
      throw new Response("CommentUid and body are required", { status: 400 });
    }
    if (await isCommunityWriteFrozen(env, { ctx, operation: "content-comment.update" })) {
      return communityWriteMaintenanceResponse();
    }
    await updateComment(
      env,
      currentUser.id,
      actionData.commentUid,
      actionData.body,
      actionData.visibility ?? "private",
    );
  } else if (actionData.action === "delete") {
    if (!actionData.commentUid) {
      throw new Response("CommentUid is required", { status: 400 });
    }
    if (await isCommunityWriteFrozen(env, { ctx, operation: "content-comment.delete" })) {
      return communityWriteMaintenanceResponse();
    }
    await deleteComment(env, currentUser.id, actionData.commentUid);
  } else if (actionData.action === "pin") {
    if (!actionData.commentUid) {
      throw new Response("CommentUid is required", { status: 400 });
    }
    if (await isCommunityWriteFrozen(env, { ctx, operation: "content-comment.pin" })) {
      return communityWriteMaintenanceResponse();
    }
    await pinComment(env, currentUser.id, contentUid, actionData.commentUid);
  } else if (actionData.action === "unpin") {
    if (await isCommunityWriteFrozen(env, { ctx, operation: "content-comment.unpin" })) {
      return communityWriteMaintenanceResponse();
    }
    await unpinComment(env, currentUser.id, contentUid);
  } else {
    throw new Response("Invalid action", { status: 400 });
  }

  // Return updated comments
  return getNestedContentComments(env, contentUid, currentUser);
};
