import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getActiveSensei, sessionStorage } from "~/auth/authenticator.server";
import { isDiscordOAuthStateValid } from "~/domain/discord-notifications";
import {
  DiscordIdentityAlreadyLinkedError,
  getDiscordOAuthCallbackUrl,
  markDiscordConnectionFailed,
  upsertPendingDiscordConnection,
} from "~/models/discord-notifications.server";
import { DISCORD_OAUTH_STATE_SESSION_KEY } from "./notifications.discord.start";

type DiscordTokenResponse = { access_token?: string; error?: string };
type DiscordUserResponse = { id?: string };

function redirectWithCookie(location: string, cookie: string): Response {
  return redirect(location, { headers: { "Set-Cookie": cookie } });
}

async function exchangeCode(env: Env, code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.DISCORD_OAUTH_CLIENT_ID,
    client_secret: env.DISCORD_OAUTH_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: getDiscordOAuthCallbackUrl(env.HOST),
  });
  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = (await response.json()) as DiscordTokenResponse;
  if (!response.ok || !result.access_token) {
    throw new Error(result.error ?? "Discord token exchange failed");
  }
  return result.access_token;
}

async function fetchDiscordIdentity(accessToken: string): Promise<string> {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const result = (await response.json()) as DiscordUserResponse;
  if (!response.ok || !result.id) throw new Error("Discord identity lookup failed");
  return result.id;
}

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const url = new URL(request.url);
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized");

  const storage = sessionStorage(env);
  const session = await storage.getSession(request.headers.get("Cookie"));
  const stateValue = session.get(DISCORD_OAUTH_STATE_SESSION_KEY);
  session.unset(DISCORD_OAUTH_STATE_SESSION_KEY);
  const cookie = await storage.commitSession(session);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const isValidState = isDiscordOAuthStateValid(stateValue, state, sensei.id);

  if (!isValidState || !code) {
    return redirectWithCookie("/notifications?discord=failed", cookie);
  }

  try {
    // The short-lived OAuth token stays in this request and is never persisted.
    const accessToken = await exchangeCode(env, code);
    const discordUserId = await fetchDiscordIdentity(accessToken);
    await upsertPendingDiscordConnection(env, sensei.id, discordUserId, { ctx });
    return redirectWithCookie("/notifications?discord=pending", cookie);
  } catch (error) {
    if (!(error instanceof DiscordIdentityAlreadyLinkedError)) {
      await markDiscordConnectionFailed(env, sensei.id, "Discord OAuth verification failed", { ctx }).catch(
        () => undefined,
      );
    }
    const message = error instanceof DiscordIdentityAlreadyLinkedError ? "identity_in_use" : "failed";
    return redirectWithCookie(`/notifications?discord=${message}`, cookie);
  }
};
