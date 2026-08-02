import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import type { LikeChangedActionResult } from "~/domain/like";
import { communityWriteMaintenanceResponse, isCommunityWriteFrozen } from "~/lib/community-write-freeze.server";
import {
  getCommunityLikeCountsByPostUids,
  getLikedCommunityPostUids,
  setCommunityPostLike,
} from "~/models/community.server";

export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const postUid = params.uid;
  if (!postUid) {
    throw new Response("Post UID is required", { status: 400 });
  }

  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  const [counts, likedPostUids] = await Promise.all([
    getCommunityLikeCountsByPostUids(env, [postUid]),
    currentUser ? getLikedCommunityPostUids(env, currentUser.id, [postUid]) : new Set<string>(),
  ]);

  return {
    likeCount: counts[postUid] ?? 0,
    liked: likedPostUids.has(postUid),
  };
};

type ActionData = {
  liked: boolean;
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
  if (await isCommunityWriteFrozen(env, { ctx, operation: "community-post-like.set" })) {
    return communityWriteMaintenanceResponse();
  }
  await setCommunityPostLike(env, currentUser.id, postUid, actionData.liked);

  const [counts, likedPostUids] = await Promise.all([
    getCommunityLikeCountsByPostUids(env, [postUid]),
    getLikedCommunityPostUids(env, currentUser.id, [postUid]),
  ]);

  return {
    kind: "likeChanged",
    targetUid: postUid,
    likeCount: counts[postUid] ?? 0,
    liked: likedPostUids.has(postUid),
  } satisfies LikeChangedActionResult;
};
