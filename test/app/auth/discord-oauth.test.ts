import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetActiveSensei = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockResolveProviderAuthentication = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLinkAuthIdentity = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRedirectTo = jest.fn<(...args: unknown[]) => string | null>(() => null);

jest.mock("~/auth/authenticator.server", () => {
  const { createCookieSessionStorage } = jest.requireActual<typeof import("react-router")>("react-router");
  return {
    authenticatorSessionKey: "user",
    getActiveSensei: (...args: unknown[]) => mockGetActiveSensei(...args),
    pendingSenseiRegistrationSessionKey: "pendingSenseiRegistrationUid",
    redirectTo: (...args: unknown[]) => mockRedirectTo(...args),
    resolveProviderAuthentication: (...args: unknown[]) => mockResolveProviderAuthentication(...args),
    sessionStorage: (env: { SESSION_SECRET: string }) =>
      createCookieSessionStorage({
        cookie: {
          name: "__session",
          path: "/",
          httpOnly: true,
          secure: true,
          secrets: [env.SESSION_SECRET],
          sameSite: "lax",
          maxAge: 30 * 24 * 60 * 60,
        },
      }),
  };
});
jest.mock("~/models/auth-identity", () => ({
  linkAuthIdentity: (...args: unknown[]) => mockLinkAuthIdentity(...args),
}));

import {
  DISCORD_OAUTH_STATE_SESSION_KEY,
  DISCORD_OAUTH_STATE_TTL_MS,
  handleDiscordOAuthCallback,
  isDiscordOAuthStateValid,
  startDiscordOAuth,
} from "~/auth/discord-oauth.server";

const env = {
  HOST: "https://mollulog.example",
  SESSION_SECRET: "test-secret",
  DISCORD_OAUTH_CLIENT_ID: "client-id",
  DISCORD_OAUTH_CLIENT_SECRET: "client-secret",
} as unknown as Env;
const sensei = { id: 7, username: "teacher", active: true };

function cookieValue(setCookie: string): string {
  return setCookie.split(";", 1)[0];
}

async function sessionFromCookie(cookie: string) {
  const { createCookieSessionStorage } = jest.requireActual<typeof import("react-router")>("react-router");
  const storage = createCookieSessionStorage({
    cookie: {
      name: "__session",
      path: "/",
      httpOnly: true,
      secure: true,
      secrets: [env.SESSION_SECRET],
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    },
  });
  return storage.getSession(cookie);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue(sensei);
  mockLinkAuthIdentity.mockResolvedValue({ ok: true });
  mockResolveProviderAuthentication.mockResolvedValue({
    kind: "pending",
    registration: { uid: "pending-1", provider: "discord", providerUserId: "1234567890" },
  });
});

describe("Discord OAuth state", () => {
  it("binds intent and link user, rejects expiry, and rejects a mismatched callback state", () => {
    const now = 1_000_000;
    const linkState = { state: "state-with-enough-entropy", intent: "link" as const, userId: 7, createdAt: now };
    expect(isDiscordOAuthStateValid(linkState, linkState.state, now)).toBe(true);
    expect(isDiscordOAuthStateValid({ ...linkState, userId: 8 }, linkState.state, now)).toBe(true);
    expect(isDiscordOAuthStateValid(linkState, "other-state", now)).toBe(false);
    expect(isDiscordOAuthStateValid(linkState, linkState.state, now + DISCORD_OAUTH_STATE_TTL_MS + 1)).toBe(false);
    expect(
      isDiscordOAuthStateValid(
        { state: linkState.state, intent: "signin", userId: 7, createdAt: now },
        linkState.state,
        now,
      ),
    ).toBe(false);
  });

  it("stores the generated state in the session and sends the intent to Discord", async () => {
    const response = await startDiscordOAuth(env, new Request("https://mollulog.example/edit#discord"), "link", 7);
    const location = new URL(response.headers.get("Location") as string);
    expect(location.pathname).toBe("/oauth2/authorize");
    expect(location.searchParams.get("redirect_uri")).toBe("https://mollulog.example/auth/discord/callback");

    const stateCookie = response.headers.get("Set-Cookie");
    expect(stateCookie).toBeTruthy();
    const session = await sessionFromCookie(cookieValue(stateCookie as string));
    expect(session.get(DISCORD_OAUTH_STATE_SESSION_KEY)).toMatchObject({ intent: "link", userId: 7 });
    expect(location.searchParams.get("state")).toBe(
      (session.get(DISCORD_OAUTH_STATE_SESSION_KEY) as { state: string }).state,
    );
  });
});

describe("Discord OAuth callback", () => {
  it("consumes state while linking the callback identity", async () => {
    const start = await startDiscordOAuth(env, new Request("https://mollulog.example/edit#discord"), "link", 7);
    const stateCookie = cookieValue(start.headers.get("Set-Cookie") as string);
    const startSession = await sessionFromCookie(stateCookie);
    const state = (startSession.get(DISCORD_OAUTH_STATE_SESSION_KEY) as { state: string }).state;
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "temporary-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "1234567890" }), { status: 200 }));

    const response = await handleDiscordOAuthCallback(
      env,
      new Request(`https://mollulog.example/auth/discord/callback?state=${state}&code=one-time-code`, {
        headers: { Cookie: stateCookie },
      }),
    );

    expect(response.headers.get("Location")).toBe("/edit?discord_auth=linked#discord");
    expect(mockLinkAuthIdentity).toHaveBeenCalledWith(env, 7, "discord", "1234567890", { ctx: undefined });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const consumedSession = await sessionFromCookie(cookieValue(response.headers.get("Set-Cookie") as string));
    expect(consumedSession.get(DISCORD_OAUTH_STATE_SESSION_KEY)).toBeUndefined();
    fetchSpy.mockRestore();
  });

  it("does not authenticate a notification-only owner and consumes the failed state", async () => {
    const start = await startDiscordOAuth(env, new Request("https://mollulog.example/"), "signin");
    const stateCookie = cookieValue(start.headers.get("Set-Cookie") as string);
    const startSession = await sessionFromCookie(stateCookie);
    const state = (startSession.get(DISCORD_OAUTH_STATE_SESSION_KEY) as { state: string }).state;
    mockResolveProviderAuthentication.mockRejectedValueOnce(
      Object.assign(new Error("Discord ID is already used"), { name: "DiscordOwnershipConflictError" }),
    );
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "temporary-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "1234567890" }), { status: 200 }));

    const response = await handleDiscordOAuthCallback(
      env,
      new Request(`https://mollulog.example/auth/discord/callback?state=${state}&code=one-time-code`, {
        headers: { Cookie: stateCookie },
      }),
    );

    expect(response.headers.get("Location")).toBe("/?auth_error=identity_in_use");
    expect(mockResolveProviderAuthentication).toHaveBeenCalled();
    expect(
      (await sessionFromCookie(cookieValue(response.headers.get("Set-Cookie") as string))).get(
        DISCORD_OAUTH_STATE_SESSION_KEY,
      ),
    ).toBeUndefined();
    fetchSpy.mockRestore();
  });

  it("maps an OAuth cancellation to the visible sign-in feedback code", async () => {
    const start = await startDiscordOAuth(env, new Request("https://mollulog.example/"), "signin");
    const stateCookie = cookieValue(start.headers.get("Set-Cookie") as string);
    const startSession = await sessionFromCookie(stateCookie);
    const state = (startSession.get(DISCORD_OAUTH_STATE_SESSION_KEY) as { state: string }).state;

    const response = await handleDiscordOAuthCallback(
      env,
      new Request(`https://mollulog.example/auth/discord/callback?state=${state}&error=access_denied`, {
        headers: { Cookie: stateCookie },
      }),
    );

    expect(response.headers.get("Location")).toBe("/?auth_error=cancelled");
    expect(response.headers.get("Set-Cookie")).toBeTruthy();
  });

  it("maps a link cancellation to profile feedback", async () => {
    const start = await startDiscordOAuth(env, new Request("https://mollulog.example/edit#discord"), "link", 7);
    const stateCookie = cookieValue(start.headers.get("Set-Cookie") as string);
    const startSession = await sessionFromCookie(stateCookie);
    const state = (startSession.get(DISCORD_OAUTH_STATE_SESSION_KEY) as { state: string }).state;

    const response = await handleDiscordOAuthCallback(
      env,
      new Request(`https://mollulog.example/auth/discord/callback?state=${state}&error=access_denied`, {
        headers: { Cookie: stateCookie },
      }),
    );

    expect(response.headers.get("Location")).toBe("/edit?discord_error=cancelled#discord");
    expect(response.headers.get("Set-Cookie")).toBeTruthy();
  });

  it("rejects a link callback whose current session no longer matches the state user", async () => {
    const start = await startDiscordOAuth(env, new Request("https://mollulog.example/edit#discord"), "link", 7);
    const stateCookie = cookieValue(start.headers.get("Set-Cookie") as string);
    const startSession = await sessionFromCookie(stateCookie);
    const state = (startSession.get(DISCORD_OAUTH_STATE_SESSION_KEY) as { state: string }).state;
    mockGetActiveSensei.mockResolvedValueOnce({ ...sensei, id: 8 });

    const response = await handleDiscordOAuthCallback(
      env,
      new Request(`https://mollulog.example/auth/discord/callback?state=${state}&code=one-time-code`, {
        headers: { Cookie: stateCookie },
      }),
    );

    expect(response.headers.get("Location")).toBe("/edit?discord_error=signin_required#discord");
    expect(mockLinkAuthIdentity).not.toHaveBeenCalled();
    expect(
      (await sessionFromCookie(cookieValue(response.headers.get("Set-Cookie") as string))).get(
        DISCORD_OAUTH_STATE_SESSION_KEY,
      ),
    ).toBeUndefined();
  });
});
