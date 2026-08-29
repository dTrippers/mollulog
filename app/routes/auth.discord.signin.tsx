import type { ActionFunctionArgs } from "react-router";
import { startDiscordOAuth } from "~/auth/discord-oauth.server";

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env } = context.cloudflare;
  return startDiscordOAuth(env, request, "signin");
};
