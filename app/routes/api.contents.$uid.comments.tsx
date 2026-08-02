import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
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
  return nestComments(await getContentComments(env, contentUid, currentUser?.id), currentUser);
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

  const { env } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const actionData = await request.json<ActionData>();
  if (actionData.action === "create") {
    if (!actionData.body) {
      throw new Response("Body is required", { status: 400 });
    }
    await createComment(env, currentUser.id, contentUid, actionData.body, actionData.visibility ?? "private");
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
    );
  } else if (actionData.action === "update") {
    if (!actionData.commentUid || !actionData.body) {
      throw new Response("CommentUid and body are required", { status: 400 });
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
  return getNestedContentComments(env, contentUid, currentUser);
};
