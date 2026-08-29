import { type ActionFunctionArgs, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { startDiscordOAuth } from "~/auth/discord-oauth.server";

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/edit?discord_error=signin_required#discord");
  return startDiscordOAuth(env, request, "link", sensei.id);
};
