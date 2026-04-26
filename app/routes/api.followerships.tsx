import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { follow, unfollow } from "~/models/followership";
import { getSenseiByUsername } from "~/models/sensei";

export const action: ActionFunction = async ({ request, context }) => {
  const { env, ctx } = context.cloudflare;
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

  const followee = await getSenseiByUsername(env, followeeName.toString());
  if (!followee) {
    return errorResponse(400);
  }

  try {
    if (request.method === "POST") {
      await follow(env, follower.id, followee.id);
    } else if (request.method === "DELETE") {
      await unfollow(env, follower.id, followee.id);
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
