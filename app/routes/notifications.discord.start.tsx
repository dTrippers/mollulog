import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getActiveSensei, sessionStorage } from "~/auth/authenticator.server";
import { getDiscordOAuthCallbackUrl } from "~/models/discord-notifications.server";

export const DISCORD_OAUTH_STATE_SESSION_KEY = "discord:oauthState";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized");

  const state = crypto.randomUUID().replaceAll("-", "");
  const storage = sessionStorage(env);
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.set(DISCORD_OAUTH_STATE_SESSION_KEY, {
    state,
    userId: sensei.id,
    createdAt: Date.now(),
  });

  const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", env.DISCORD_OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", getDiscordOAuthCallbackUrl(env.HOST));
  authorizeUrl.searchParams.set("scope", "identify");
  authorizeUrl.searchParams.set("state", state);

  return redirect(authorizeUrl.toString(), {
    headers: { "Set-Cookie": await storage.commitSession(session) },
  });
};
