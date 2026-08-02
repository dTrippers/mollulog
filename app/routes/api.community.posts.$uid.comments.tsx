import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { communityWriteMaintenanceResponse, isCommunityWriteFrozen } from "~/lib/community-write-freeze.server";
import {
  createCommunityComment,
  deleteCommunityComment,
  getNestedCommunityComments,
  updateCommunityComment,
} from "~/models/community.server";
import type { CommunityPostCommentsChangedActionResult } from "~/models/community-engagement";

export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const postUid = params.uid;
  if (!postUid) {
    throw new Response("Post UID is required", { status: 400 });
  }

  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  return getNestedCommunityComments(env, postUid, currentUser?.id);
};

export type ActionData = {
  action: "create" | "createSubcomment" | "update" | "delete";
  body?: string;
  visibility?: "private" | "public";
  parentCommentUid?: string;
  commentUid?: string;
};

export const action = async ({ request, params, context }: ActionFunctionArgs) => {
  const postUid = params.uid;
  if (!postUid) {
    throw new Response("Post UID is required", { status: 400 });
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

    if (await isCommunityWriteFrozen(env, { ctx, operation: "community-post-comment.create" })) {
      return communityWriteMaintenanceResponse();
    }

    await createCommunityComment(env, currentUser.id, postUid, actionData.body, actionData.visibility ?? "public");
  } else if (actionData.action === "createSubcomment") {
    if (!actionData.body || !actionData.parentCommentUid) {
      throw new Response("Body and parentCommentUid are required", { status: 400 });
    }

    if (await isCommunityWriteFrozen(env, { ctx, operation: "community-post-comment.create-subcomment" })) {
      return communityWriteMaintenanceResponse();
    }

    await createCommunityComment(env, currentUser.id, postUid, actionData.body, "public", actionData.parentCommentUid);
  } else if (actionData.action === "update") {
    if (!actionData.commentUid || !actionData.body) {
      throw new Response("CommentUid and body are required", { status: 400 });
    }

    if (await isCommunityWriteFrozen(env, { ctx, operation: "community-post-comment.update" })) {
      return communityWriteMaintenanceResponse();
    }

    await updateCommunityComment(
      env,
      currentUser.id,
      actionData.commentUid,
      actionData.body,
      actionData.visibility ?? "public",
    );
  } else if (actionData.action === "delete") {
    if (!actionData.commentUid) {
      throw new Response("CommentUid is required", { status: 400 });
    }

    if (await isCommunityWriteFrozen(env, { ctx, operation: "community-post-comment.delete" })) {
      return communityWriteMaintenanceResponse();
    }

    await deleteCommunityComment(env, currentUser.id, actionData.commentUid);
  } else {
    throw new Response("Invalid action", { status: 400 });
  }

  return {
    kind: "communityPostCommentsChanged",
    postUid,
    comments: await getNestedCommunityComments(env, postUid, currentUser.id),
  } satisfies CommunityPostCommentsChangedActionResult;
};
