import { redirect } from "react-router";
import {
  authenticatorSessionKey,
  getActiveSensei,
  pendingSenseiRegistrationSessionKey,
  redirectTo,
  resolveProviderAuthentication,
  sessionStorage,
} from "~/auth/authenticator.server";
import { linkAuthIdentity } from "~/models/auth-identity";
import {
  DiscordIdentityAlreadyLinkedError,
  type PendingDiscordConnection,
  upsertPendingDiscordConnection,
} from "~/models/discord-notifications.server";

export const DISCORD_OAUTH_STATE_SESSION_KEY = "discord:oauthState";
export const DISCORD_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type DiscordOAuthIntent = "signin" | "link" | "notification-connect";

export type DiscordOAuthState = {
  state: string;
  intent: DiscordOAuthIntent;
  userId?: number;
  createdAt: number;
};

type DiscordTokenResponse = {
  access_token?: unknown;
};

type DiscordUserResponse = {
  id?: unknown;
};

function getDiscordOAuthCallbackUrl(host: string): string {
  return new URL("/auth/discord/callback", host).toString();
}

class DiscordOAuthProviderError extends Error {
  constructor() {
    super("Discord OAuth request failed");
    this.name = "DiscordOAuthProviderError";
  }
}

function queueDiscordConnectionVerification(
  env: Env,
  connection: PendingDiscordConnection,
  ctx?: ExecutionContext,
): void {
  if (!env.DISCORD_NOTIFICATIONS_QUEUE || !ctx) return;
  ctx.waitUntil(
    env.DISCORD_NOTIFICATIONS_QUEUE.send({
      type: "connection-request",
      connectionUid: connection.connectionUid,
      connectionVersion: connection.connectionVersion,
    }).catch((error) => {
      console.error("[discord-oauth] failed to queue immediate connection verification", error);
    }),
  );
}

function isOAuthIntent(value: unknown): value is DiscordOAuthIntent {
  return value === "signin" || value === "link" || value === "notification-connect";
}

export function isDiscordOAuthStateValid(
  value: unknown,
  returnedState: string | null,
  now = Date.now(),
): value is DiscordOAuthState {
  if (!Number.isSafeInteger(now)) return false;
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<DiscordOAuthState>;
  const createdAt = state.createdAt;
  if (
    typeof state.state !== "string" ||
    state.state.length < 16 ||
    state.state !== returnedState ||
    !isOAuthIntent(state.intent) ||
    typeof createdAt !== "number" ||
    !Number.isSafeInteger(createdAt) ||
    now < createdAt ||
    now - createdAt > DISCORD_OAUTH_STATE_TTL_MS
  ) {
    return false;
  }
  if (state.intent === "signin") return state.userId === undefined;
  return Number.isSafeInteger(state.userId) && (state.userId as number) > 0;
}

function appendCookies(response: Response, cookies: Array<string | null | undefined>): Response {
  const headers = new Headers(response.headers);
  for (const cookie of cookies) {
    if (cookie) headers.append("Set-Cookie", cookie);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function redirectWithCookies(location: string, cookies: Array<string | null | undefined>): Response {
  return appendCookies(redirect(location), cookies);
}

function errorLocation(
  intent: DiscordOAuthIntent | undefined,
  code: "cancelled" | "failed" | "identity_in_use" | "signin_required",
) {
  if (intent === "link") return `/edit?discord_error=${code}#connected-services`;
  if (intent === "notification-connect") return `/edit?discord_notice=${code}#discord-notifications`;
  return `/?auth_error=${code}`;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json<T>();
  } catch {
    return null;
  }
}

async function exchangeCode(env: Env, code: string): Promise<string> {
  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_OAUTH_CLIENT_ID,
      client_secret: env.DISCORD_OAUTH_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: getDiscordOAuthCallbackUrl(env.HOST),
    }),
  });
  const result = await readJson<DiscordTokenResponse>(response);
  if (!response.ok || typeof result?.access_token !== "string" || result.access_token.length === 0) {
    throw new DiscordOAuthProviderError();
  }
  return result.access_token;
}

async function fetchDiscordIdentity(accessToken: string): Promise<string> {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const result = await readJson<DiscordUserResponse>(response);
  if (!response.ok || typeof result?.id !== "string" || !/^\d{2,32}$/.test(result.id)) {
    throw new DiscordOAuthProviderError();
  }
  return result.id;
}

export async function startDiscordOAuth(
  env: Env,
  request: Request,
  intent: DiscordOAuthIntent,
  userId?: number,
): Promise<Response> {
  if (intent !== "signin" && (!Number.isSafeInteger(userId) || (userId as number) <= 0)) {
    return redirect(errorLocation(intent, "signin_required"));
  }

  const state: DiscordOAuthState = {
    state: crypto.randomUUID().replaceAll("-", ""),
    intent,
    ...(intent !== "signin" ? { userId } : {}),
    createdAt: Date.now(),
  };
  const storage = sessionStorage(env);
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.set(DISCORD_OAUTH_STATE_SESSION_KEY, state);

  const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", env.DISCORD_OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", getDiscordOAuthCallbackUrl(env.HOST));
  authorizeUrl.searchParams.set(
    "scope",
    intent === "notification-connect" ? "identify applications.commands" : "identify",
  );
  if (intent === "notification-connect") authorizeUrl.searchParams.set("integration_type", "1");
  authorizeUrl.searchParams.set("state", state.state);

  return redirect(authorizeUrl.toString(), {
    headers: { "Set-Cookie": await storage.commitSession(session) },
  });
}

type DiscordOAuthSession = Awaited<ReturnType<ReturnType<typeof sessionStorage>["getSession"]>>;

async function consumeState(
  env: Env,
  request: Request,
): Promise<{ value: unknown; session: DiscordOAuthSession; storage: ReturnType<typeof sessionStorage> }> {
  const storage = sessionStorage(env);
  const session = await storage.getSession(request.headers.get("Cookie"));
  const value = session.get(DISCORD_OAUTH_STATE_SESSION_KEY);
  session.unset(DISCORD_OAUTH_STATE_SESSION_KEY);
  return { value, session, storage };
}

function setUserSession(session: DiscordOAuthSession, sensei: Awaited<ReturnType<typeof getActiveSensei>>): void {
  if (!sensei) throw new Error("Cannot commit an anonymous session");
  session.set(authenticatorSessionKey, sensei);
  session.unset(pendingSenseiRegistrationSessionKey);
}

function setPendingRegistrationSession(session: DiscordOAuthSession, registrationUid: string): void {
  session.unset(authenticatorSessionKey);
  session.set(pendingSenseiRegistrationSessionKey, registrationUid);
}

/**
 * Handles Discord sign-in, profile-link, and notification-connect callbacks.
 * Provider tokens stay local to this request and are never placed in cookies
 * or PostgreSQL.
 */
export async function handleDiscordOAuthCallback(
  env: Env,
  request: Request,
  ctx?: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  let consumed: Awaited<ReturnType<typeof consumeState>>;
  try {
    consumed = await consumeState(env, request);
  } catch {
    return redirect(errorLocation(undefined, "failed"));
  }
  const { value, session, storage } = consumed;
  const stateIntent =
    value && typeof value === "object" && "intent" in value && isOAuthIntent(value.intent) ? value.intent : undefined;
  const returnedState = url.searchParams.get("state");

  if (!isDiscordOAuthStateValid(value, returnedState)) {
    return redirectWithCookies(errorLocation(stateIntent, "failed"), [await storage.commitSession(session)]);
  }

  if (url.searchParams.has("error")) {
    const code = url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed";
    return redirectWithCookies(errorLocation(value.intent, code), [await storage.commitSession(session)]);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return redirectWithCookies(errorLocation(value.intent, "failed"), [await storage.commitSession(session)]);
  }

  try {
    if (value.intent === "link" || value.intent === "notification-connect") {
      const sensei = await getActiveSensei(env, request, ctx);
      if (!sensei || sensei.id !== value.userId) {
        return redirectWithCookies(errorLocation(value.intent, "signin_required"), [
          await storage.commitSession(session),
        ]);
      }
    }

    const accessToken = await exchangeCode(env, code);
    const discordUserId = await fetchDiscordIdentity(accessToken);
    if (value.intent === "link") {
      const result = await linkAuthIdentity(env, value.userId as number, "discord", discordUserId, { ctx });
      if (!result.ok) {
        return redirectWithCookies(errorLocation("link", "identity_in_use"), [await storage.commitSession(session)]);
      }
      return redirectWithCookies("/edit?discord_auth=linked#connected-services", [
        await storage.commitSession(session),
      ]);
    }

    if (value.intent === "notification-connect") {
      const connection = await upsertPendingDiscordConnection(env, value.userId as number, discordUserId, { ctx });
      queueDiscordConnectionVerification(env, connection, ctx);
      return redirectWithCookies("/edit?discord_notice=pending#discord-notifications", [
        await storage.commitSession(session),
      ]);
    }

    const resolution = await resolveProviderAuthentication(env, "discord", discordUserId, ctx);
    if (resolution.kind === "authenticated") {
      setUserSession(session, resolution.sensei);
      return redirectWithCookies(redirectTo(request) ?? `/@${resolution.sensei.username}`, [
        await storage.commitSession(session),
      ]);
    }

    setPendingRegistrationSession(session, resolution.registration.uid);
    return redirectWithCookies("/register", [await storage.commitSession(session)]);
  } catch (error) {
    if (
      error instanceof DiscordIdentityAlreadyLinkedError ||
      (error instanceof Error && error.name === "DiscordOwnershipConflictError")
    ) {
      return redirectWithCookies(errorLocation(value.intent, "identity_in_use"), [
        await storage.commitSession(session),
      ]);
    }
    return redirectWithCookies(errorLocation(value.intent, "failed"), [await storage.commitSession(session)]);
  }
}
