import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetActiveSensei = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockResolveProviderAuthentication = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLinkAuthIdentity = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpsertPendingDiscordConnection = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockDiscordNotificationQueueSend = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockRedirectTo = jest.fn<(...args: unknown[]) => string | null>(() => null);
const MockDiscordIdentityAlreadyLinkedError = class extends Error {
  constructor() {
    super("already linked");
    this.name = "DiscordIdentityAlreadyLinkedError";
  }
};

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
jest.mock("~/models/discord-notifications.server", () => ({
  DiscordIdentityAlreadyLinkedError: MockDiscordIdentityAlreadyLinkedError,
  upsertPendingDiscordConnection: (...args: unknown[]) => mockUpsertPendingDiscordConnection(...args),
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
  DISCORD_NOTIFICATIONS_QUEUE: { send: (...args: unknown[]) => mockDiscordNotificationQueueSend(...args) },
} as unknown as Env;
const sensei = { id: 7, username: "teacher", active: true };
const waitUntilPromises: Promise<unknown>[] = [];
const ctx = {
  waitUntil(promise: Promise<unknown>) {
    waitUntilPromises.push(promise);
  },
} as ExecutionContext;

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
  waitUntilPromises.length = 0;
  mockGetActiveSensei.mockResolvedValue(sensei);
  mockLinkAuthIdentity.mockResolvedValue({ ok: true });
  mockUpsertPendingDiscordConnection.mockResolvedValue({
    status: "pending",
    connectionUid: "subscription-1",
    connectionVersion: Date.parse("2026-09-01T00:00:00.000Z"),
  });
  mockDiscordNotificationQueueSend.mockResolvedValue();
  mockResolveProviderAuthentication.mockResolvedValue({
    kind: "pending",
    registration: { uid: "pending-1", provider: "discord", providerUserId: "1234567890" },
  });
});

describe("Discord OAuth state", () => {
  it("binds intent and link user, rejects expiry, and rejects a mismatched callback state", () => {
    const now = 1_000_000;
    const linkState = { state: "state-with-enough-entropy", intent: "link" as const, userId: 7, createdAt: now };
    const notificationState = {
      state: "notification-state-with-entropy",
      intent: "notification-connect" as const,
      userId: 7,
      createdAt: now,
    };
    expect(isDiscordOAuthStateValid(linkState, linkState.state, now)).toBe(true);
    expect(isDiscordOAuthStateValid(notificationState, notificationState.state, now)).toBe(true);
    expect(isDiscordOAuthStateValid({ ...notificationState, userId: undefined }, notificationState.state, now)).toBe(
      false,
    );
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
    expect(location.searchParams.get("scope")).toBe("identify");
    expect(location.searchParams.get("integration_type")).toBeNull();

    const stateCookie = response.headers.get("Set-Cookie");
    expect(stateCookie).toBeTruthy();
    const session = await sessionFromCookie(cookieValue(stateCookie as string));
    expect(session.get(DISCORD_OAUTH_STATE_SESSION_KEY)).toMatchObject({ intent: "link", userId: 7 });
    expect(location.searchParams.get("state")).toBe(
      (session.get(DISCORD_OAUTH_STATE_SESSION_KEY) as { state: string }).state,
    );
  });

  it("requests User Install scopes only for notification connection", async () => {
    const response = await startDiscordOAuth(
      env,
      new Request("https://mollulog.example/edit#discord-notifications"),
      "notification-connect",
      7,
    );
    const location = new URL(response.headers.get("Location") as string);
    expect(location.searchParams.get("scope")).toBe("identify applications.commands");
    expect(location.searchParams.get("integration_type")).toBe("1");

    const stateCookie = response.headers.get("Set-Cookie");
    const session = await sessionFromCookie(cookieValue(stateCookie as string));
    expect(session.get(DISCORD_OAUTH_STATE_SESSION_KEY)).toMatchObject({
      intent: "notification-connect",
      userId: 7,
    });
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

    expect(response.headers.get("Location")).toBe("/edit?discord_auth=linked#connected-services");
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

    expect(response.headers.get("Location")).toBe("/edit?discord_error=cancelled#connected-services");
    expect(response.headers.get("Set-Cookie")).toBeTruthy();
  });

  it("connects notifications through the signed-in user and redirects with pending feedback", async () => {
    const start = await startDiscordOAuth(
      env,
      new Request("https://mollulog.example/edit#discord-notifications"),
      "notification-connect",
      7,
    );
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
      ctx,
    );

    expect(response.headers.get("Location")).toBe("/edit?discord_notice=pending#discord-notifications");
    expect(mockGetActiveSensei).toHaveBeenCalled();
    expect(mockUpsertPendingDiscordConnection).toHaveBeenCalledWith(env, 7, "1234567890", { ctx });
    expect(mockDiscordNotificationQueueSend).toHaveBeenCalledWith({
      type: "connection-request",
      connectionUid: "subscription-1",
      connectionVersion: Date.parse("2026-09-01T00:00:00.000Z"),
    });
    expect(waitUntilPromises).toHaveLength(1);
    await Promise.all(waitUntilPromises);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it("keeps the pending connection when the immediate Queue handoff fails", async () => {
    const start = await startDiscordOAuth(
      env,
      new Request("https://mollulog.example/edit#discord-notifications"),
      "notification-connect",
      7,
    );
    const stateCookie = cookieValue(start.headers.get("Set-Cookie") as string);
    const startSession = await sessionFromCookie(stateCookie);
    const state = (startSession.get(DISCORD_OAUTH_STATE_SESSION_KEY) as { state: string }).state;
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "temporary-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "1234567890" }), { status: 200 }));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockDiscordNotificationQueueSend.mockRejectedValueOnce(new Error("Queue unavailable"));

    const response = await handleDiscordOAuthCallback(
      env,
      new Request(`https://mollulog.example/auth/discord/callback?state=${state}&code=one-time-code`, {
        headers: { Cookie: stateCookie },
      }),
      ctx,
    );
    await Promise.all(waitUntilPromises);

    expect(response.headers.get("Location")).toBe("/edit?discord_notice=pending#discord-notifications");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[discord-oauth] failed to queue immediate connection verification",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it("maps notification OAuth cancellation to notification feedback", async () => {
    const start = await startDiscordOAuth(env, new Request("https://mollulog.example/"), "notification-connect", 7);
    const stateCookie = cookieValue(start.headers.get("Set-Cookie") as string);
    const startSession = await sessionFromCookie(stateCookie);
    const state = (startSession.get(DISCORD_OAUTH_STATE_SESSION_KEY) as { state: string }).state;

    const response = await handleDiscordOAuthCallback(
      env,
      new Request(`https://mollulog.example/auth/discord/callback?state=${state}&error=access_denied`, {
        headers: { Cookie: stateCookie },
      }),
    );

    expect(response.headers.get("Location")).toBe("/edit?discord_notice=cancelled#discord-notifications");
    expect(mockUpsertPendingDiscordConnection).not.toHaveBeenCalled();
  });

  it("rejects a notification callback when the signed-in user no longer matches state", async () => {
    const start = await startDiscordOAuth(env, new Request("https://mollulog.example/"), "notification-connect", 7);
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

    expect(response.headers.get("Location")).toBe("/edit?discord_notice=signin_required#discord-notifications");
    expect(mockUpsertPendingDiscordConnection).not.toHaveBeenCalled();
  });

  it("maps a notification ownership conflict to notification feedback", async () => {
    const start = await startDiscordOAuth(env, new Request("https://mollulog.example/"), "notification-connect", 7);
    const stateCookie = cookieValue(start.headers.get("Set-Cookie") as string);
    const startSession = await sessionFromCookie(stateCookie);
    const state = (startSession.get(DISCORD_OAUTH_STATE_SESSION_KEY) as { state: string }).state;
    mockUpsertPendingDiscordConnection.mockRejectedValueOnce(new MockDiscordIdentityAlreadyLinkedError());
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

    expect(response.headers.get("Location")).toBe("/edit?discord_notice=identity_in_use#discord-notifications");
    fetchSpy.mockRestore();
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

    expect(response.headers.get("Location")).toBe("/edit?discord_error=signin_required#connected-services");
    expect(mockLinkAuthIdentity).not.toHaveBeenCalled();
    expect(
      (await sessionFromCookie(cookieValue(response.headers.get("Set-Cookie") as string))).get(
        DISCORD_OAUTH_STATE_SESSION_KEY,
      ),
    ).toBeUndefined();
  });
});
