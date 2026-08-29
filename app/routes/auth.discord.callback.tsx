import type { LoaderFunctionArgs } from "react-router";
import { handleDiscordOAuthCallback } from "~/auth/discord-oauth.server";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  return handleDiscordOAuthCallback(env, request, ctx);
};
