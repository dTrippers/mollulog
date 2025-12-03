import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { createComment, createSubcomment, updateComment, deleteComment, getNestedContentComments, getCommentIdByUid, nestComments, getContentComments } from "~/models/content";

export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const contentUid = params.uid;
  if (!contentUid) {
    throw new Response("Content UID is required", { status: 400 });
  }

  const env = context.cloudflare.env;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  return nestComments(await getContentComments(env, contentUid, currentUser?.id), currentUser);
};

export type ActionData = {
  action: "create" | "createSubcomment" | "update" | "delete";
  body?: string;
  visibility?: "private" | "public";
  parentCommentId?: string;
  commentUid?: string;
};

export const action = async ({ request, params, context }: ActionFunctionArgs) => {
  const contentUid = params.uid;
  if (!contentUid) {
    throw new Response("Content UID is required", { status: 400 });
  }

  const env = context.cloudflare.env;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
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
    if (!actionData.body || !actionData.parentCommentId) {
      throw new Response("Body and parentCommentId are required", { status: 400 });
    }

    const parentId = await getCommentIdByUid(env, actionData.parentCommentId);
    if (!parentId) {
      throw new Response("Parent comment not found", { status: 404 });
    }
    await createSubcomment(env, currentUser.id, contentUid, parentId, actionData.body, actionData.visibility ?? "private");
  } else if (actionData.action === "update") {
    if (!actionData.commentUid || !actionData.body) {
      throw new Response("CommentUid and body are required", { status: 400 });
    }
    await updateComment(env, currentUser.id, actionData.commentUid, actionData.body, actionData.visibility ?? "private");
  } else if (actionData.action === "delete") {
    if (!actionData.commentUid) {
      throw new Response("CommentUid is required", { status: 400 });
    }
    await deleteComment(env, currentUser.id, actionData.commentUid);
  } else {
    throw new Response("Invalid action", { status: 400 });
  }

  // Return updated comments
  return getNestedContentComments(env, contentUid, currentUser);
};

