import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetAccountSessionState = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/models/account-security", () => ({
  getAccountSessionState: (...args: unknown[]) => mockGetAccountSessionState(...args),
}));
jest.mock("~/auth/authenticator.server", () => ({
  authenticatorSessionKey: "user",
  sessionValidationCookieName: "__session_validation",
  sessionValidationSessionKey: "auth:sessionValidation",
  sessionStorage: (env: { SESSION_SECRET: string }) => {
    const { createCookieSessionStorage } = jest.requireActual<typeof import("react-router")>("react-router");
    return createCookieSessionStorage({
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
  },
  sessionValidationStorage: (env: { SESSION_SECRET: string }) => {
    const { createCookieSessionStorage } = jest.requireActual<typeof import("react-router")>("react-router");
    return createCookieSessionStorage({
      cookie: {
        name: "__session_validation",
        path: "/",
        httpOnly: true,
        secure: true,
        secrets: [env.SESSION_SECRET],
        sameSite: "lax",
        maxAge: 15 * 60,
      },
    });
  },
}));

import {
  authenticatorSessionKey,
  sessionStorage,
  sessionValidationSessionKey,
  sessionValidationStorage,
} from "~/auth/authenticator.server";
import {
  applySessionValidationResponse,
  SESSION_VALIDATION_LEASE_MS,
  validateSessionRequest,
} from "~/auth/session-validation.server";

const env = {
  SESSION_SECRET: "test-secret",
  HYPERDRIVE: { connectionString: "postgres://unused" },
} as unknown as Env;

function cookieValue(setCookie: string): string {
  return setCookie.split(";", 1)[0] ?? setCookie;
}

async function createAuthCookie(options: { validatedAt?: number; sessionVersion?: number } = {}) {
  const authStorage = sessionStorage(env);
  const authSession = await authStorage.getSession();
  authSession.set(authenticatorSessionKey, { id: 7, active: true });
  const cookies = [cookieValue(await authStorage.commitSession(authSession))];
  if (options.validatedAt !== undefined) {
    const leaseStorage = sessionValidationStorage(env);
    const leaseSession = await leaseStorage.getSession();
    leaseSession.set(sessionValidationSessionKey, {
      userId: 7,
      validatedAt: options.validatedAt,
      ...(options.sessionVersion === undefined ? {} : { sessionVersion: options.sessionVersion }),
    });
    cookies.push(cookieValue(await leaseStorage.commitSession(leaseSession)));
  }
  return cookies.join("; ");
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("session validation", () => {
  it("does not query PostgreSQL for an anonymous request", async () => {
    await expect(validateSessionRequest(env, new Request("https://mollulog.net/edit/leave"))).resolves.toEqual({
      kind: "anonymous",
    });
    expect(mockGetAccountSessionState).not.toHaveBeenCalled();
  });

  it("validates an authenticated GET and issues a fifteen-minute lease cookie", async () => {
    mockGetAccountSessionState.mockResolvedValue({ active: true });
    const authCookie = await createAuthCookie();
    const result = await validateSessionRequest(
      env,
      new Request("https://mollulog.net/edit/leave", { headers: { Cookie: authCookie } }),
      undefined,
      10_000,
    );

    expect(result.kind).toBe("validated");
    expect(result).toHaveProperty("refreshCookie");
    expect((result as { refreshCookie: string }).refreshCookie).toMatch(/^__session_validation=/);
    expect((result as { refreshCookie: string }).refreshCookie).not.toMatch(/^__session=/);
    expect((result as { refreshCookie: string }).refreshCookie).toContain("Max-Age=900");
    expect(mockGetAccountSessionState).toHaveBeenCalledWith(env, 7, { ctx: undefined });

    const refreshedCookie = cookieValue((result as { refreshCookie: string }).refreshCookie);
    const next = await validateSessionRequest(
      env,
      new Request("https://mollulog.net/edit/leave", {
        headers: { Cookie: `${authCookie}; ${refreshedCookie}` },
      }),
      undefined,
      10_000 + SESSION_VALIDATION_LEASE_MS - 1,
    );
    expect(next).toEqual({ kind: "validated" });
    expect(mockGetAccountSessionState).toHaveBeenCalledTimes(1);
  });

  it("does not query PostgreSQL for a mutation while a legacy lease is fresh", async () => {
    const cookie = await createAuthCookie({ validatedAt: 10_000, sessionVersion: 4 });
    const result = await validateSessionRequest(
      env,
      new Request("https://mollulog.net/edit/leave", {
        method: "POST",
        headers: { Cookie: cookie },
      }),
      undefined,
      10_001,
    );

    expect(result.kind).toBe("validated");
    expect(mockGetAccountSessionState).not.toHaveBeenCalled();
  });

  it.each(["GET", "POST"])("expires the cookie when the account is inactive for %s requests", async (method) => {
    mockGetAccountSessionState.mockResolvedValue({ active: false });
    const result = await validateSessionRequest(
      env,
      new Request("https://mollulog.net/edit/leave", {
        method,
        headers: { Cookie: await createAuthCookie({ validatedAt: 10_000 }) },
      }),
      undefined,
      10_000 + SESSION_VALIDATION_LEASE_MS,
    );

    expect(result.kind).toBe("response");
    expect(mockGetAccountSessionState).toHaveBeenCalledWith(env, 7, { ctx: undefined });
    const response = (result as { response: Response }).response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/unauthorized");
    expect(response.headers.get("Set-Cookie")).toContain("__session=;");
    expect(response.headers.get("Set-Cookie")).toContain("__session_validation=;");
  });

  it("returns a React Router single-fetch redirect for an inactive account data request", async () => {
    mockGetAccountSessionState.mockResolvedValue({ active: false });
    const result = await validateSessionRequest(
      env,
      new Request("https://mollulog.net/edit/leave.data", { headers: { Cookie: await createAuthCookie() } }),
    );

    expect(result.kind).toBe("response");
    const response = (result as { response: Response }).response;
    expect(response.status).toBe(204);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("X-Remix-Redirect")).toBe("/unauthorized");
    expect(response.headers.get("X-Remix-Status")).toBe("302");
    expect(response.headers.getSetCookie()).toHaveLength(2);
  });

  it.each([
    "GET",
    "POST",
  ])("returns a retryable response when PostgreSQL validation fails for %s requests", async (method) => {
    mockGetAccountSessionState.mockRejectedValue(new Error("connection refused"));
    const result = await validateSessionRequest(
      env,
      new Request("https://mollulog.net/edit/leave", {
        method,
        headers: { Cookie: await createAuthCookie() },
      }),
    );

    expect(result.kind).toBe("response");
    const response = (result as { response: Response }).response;
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    await expect(response.text()).resolves.toContain("다시 시도해주세요");
  });

  it("single-flights concurrent validation for the same session without retaining a cache", async () => {
    let resolveState!: (state: { active: boolean }) => void;
    mockGetAccountSessionState.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      }),
    );
    const cookie = await createAuthCookie();
    const first = validateSessionRequest(
      env,
      new Request("https://mollulog.net/edit/leave", { headers: { Cookie: cookie } }),
      undefined,
      20_000,
    );
    const second = validateSessionRequest(
      env,
      new Request("https://mollulog.net/edit/leave", { headers: { Cookie: cookie } }),
      undefined,
      20_000,
    );
    for (let attempt = 0; attempt < 20 && mockGetAccountSessionState.mock.calls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(mockGetAccountSessionState).toHaveBeenCalledTimes(1);
    resolveState({ active: true });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    mockGetAccountSessionState.mockResolvedValue({ active: true });
    await validateSessionRequest(
      env,
      new Request("https://mollulog.net/edit/leave", { headers: { Cookie: cookie } }),
      undefined,
      20_000,
    );
    expect(mockGetAccountSessionState).toHaveBeenCalledTimes(2);
  });

  it("preserves downstream cookies and marks cookie responses uncacheable", async () => {
    const response = applySessionValidationResponse(new Response("ok", { headers: { "Set-Cookie": "downstream=1" } }), {
      kind: "validated",
      refreshCookie: "__session_validation=refreshed",
    });

    expect(response.headers.get("Set-Cookie")).toContain("downstream=1");
    expect(response.headers.get("Set-Cookie")).toContain("__session_validation=refreshed");
    expect(response.headers.get("Set-Cookie")).not.toMatch(/__session=/);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, no-transform");
    await expect(response.text()).resolves.toBe("ok");
  });

  it("does not append a refresh over a downstream session logout cookie", () => {
    const response = applySessionValidationResponse(
      new Response(null, { headers: { "Set-Cookie": "__session=; Max-Age=0" } }),
      { kind: "validated", refreshCookie: "__session_validation=refreshed" },
    );

    expect(response.headers.get("Set-Cookie")).toBe("__session=; Max-Age=0");
  });

  it("detects downstream session cookies without splitting an Expires attribute on commas", () => {
    const headers = new Headers();
    headers.append("Set-Cookie", "__session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    headers.append("Set-Cookie", "another=value; Path=/");

    const response = applySessionValidationResponse(new Response(null, { headers }), {
      kind: "validated",
      refreshCookie: "__session_validation=refreshed",
    });

    expect(response.headers.getSetCookie()).toEqual([
      "__session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "another=value; Path=/",
    ]);
  });

  it("clears a stale lease cookie when the auth session is already gone", async () => {
    const leaseStorage = sessionValidationStorage(env);
    const leaseSession = await leaseStorage.getSession();
    leaseSession.set(sessionValidationSessionKey, {
      userId: 7,
      validatedAt: 10_000,
    });
    const leaseCookie = cookieValue(await leaseStorage.commitSession(leaseSession));

    const result = await validateSessionRequest(
      env,
      new Request("https://mollulog.net/", { headers: { Cookie: leaseCookie } }),
      undefined,
      10_001,
    );

    expect(result.kind).toBe("anonymous");
    expect((result as { refreshCookie: string }).refreshCookie).toContain("__session_validation=;");
  });
});
