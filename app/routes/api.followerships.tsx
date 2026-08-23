import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { identityMaintenanceActionResult } from "~/lib/identity-cutover.server";
import { getLogger } from "~/lib/observability.server";
import { follow, unfollow } from "~/models/followership";
import { getSenseiByUsername, isSenseiProfileVisibleTo } from "~/models/sensei";

export const action: ActionFunction = async ({ request, context }) => {
  const { env, ctx } = context.cloudflare;
  const maintenance = await identityMaintenanceActionResult(env, { ctx, operation: "followerships.action" });
  if (maintenance) return maintenance;
  const logger = getLogger(env, ctx, {
    route: "api.followerships",
    method: request.method,
  });
  const follower = await getActiveSensei(env, request, ctx);
  if (!follower) {
    return redirect("/unauthorized");
  }

  const formData = await request.formData();
  const followeeName = formData.get("username");
  if (!followeeName) {
    return errorResponse(400);
  }

  const followee = await getSenseiByUsername(env, followeeName.toString(), { ctx });
  if (!followee) {
    return errorResponse(400);
  }

  try {
    if (request.method === "POST") {
      if (!isSenseiProfileVisibleTo(followee, follower.id)) {
        return errorResponse(403, "비공개 프로필은 팔로우할 수 없어요.");
      }
      await follow(env, follower.id, followee.id, { ctx });
    } else if (request.method === "DELETE") {
      await unfollow(env, follower.id, followee.id, { ctx });
    }
    return okResponse(201, { followed: request.method === "POST" });
  } catch (error) {
    logger.error("Followership mutation failed", error, {
      followeeName: followeeName.toString(),
      followerId: follower.id,
    });
    return errorResponse(500);
  }
};

export type ActionData = {
  message?: string;
  followed?: boolean;
  error?: { message: string };
};

function okResponse(status: number, data: ActionData): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, message?: string): Response {
  return new Response(JSON.stringify({ error: { message: message ?? "error" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
