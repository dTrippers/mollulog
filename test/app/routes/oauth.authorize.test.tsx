import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("~/auth/authenticator.server", () => {
  const { createCookieSessionStorage } = jest.requireActual("react-router") as typeof import("react-router");
  const storage = createCookieSessionStorage({
    cookie: {
      name: "__session",
      path: "/",
      httpOnly: true,
      secure: true,
      secrets: ["oauth-authorize-test-session-secret"],
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    },
  });
  return { getAuthenticator: jest.fn(), sessionStorage: jest.fn(() => storage) };
});
jest.mock("~/models/sensei", () => {
  const actual = jest.requireActual<typeof import("~/models/sensei")>("~/models/sensei");
  return { ...actual, getSenseiById: jest.fn() };
});
jest.mock("~/models/mollulog-oauth", () => {
  const actual = jest.requireActual<typeof import("~/models/mollulog-oauth")>("~/models/mollulog-oauth");
  return {
    ...actual,
    getActiveOAuthGrant: jest.fn(),
    getOAuthApplicationForClient: jest.fn(),
    issueOAuthAuthorizationCode: jest.fn(),
  };
});

import { getAuthenticator } from "~/auth/authenticator.server";
import {
  getActiveOAuthGrant,
  getOAuthApplicationForClient,
  issueOAuthAuthorizationCode,
  OAuthInvalidGrantError,
} from "~/models/mollulog-oauth";
import { getSenseiById } from "~/models/sensei";
import { action, headers, loader } from "~/routes/oauth.authorize";

const env = { SESSION_SECRET: "oauth-authorize-test-session-secret", POSTGRES_URL: "postgres://local" } as unknown as Env;
const redirectUri = "https://tool.example/callback";
const sensei: { id: number; uid: string; username: string; profileStudentId: string; active: boolean } = {
  id: 42,
  uid: "sensei-uid",
  username: "testuser",
  profileStudentId: "arona",
  active: true,
};
const application = {
  id: 17,
  uid: "app-uid",
  name: "Roster Tool",
  clientId: "mllg_oc_0123456789abcdef0123456789abcdef",
  clientSecretPrefix: "mllg_os_01234567",
  redirectUris: [redirectUri],
  scopes: ["profile"],
  ownerUserId: 5,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  clientSecretIssuedAt: new Date("2026-10-01T00:00:00Z"),
  deletedAt: null,
};

function createArgs(request: Request) {
  return { request, context: { cloudflare: { env, ctx: "ctx" } } } as never;
}

function authorizeUrl(values: Record<string, string> = {}) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: application.clientId,
    redirect_uri: redirectUri,
    scope: "profile",
    state: "opaque-state",
    ...values,
  });
  return `https://mollulog.net/oauth/authorize?${params.toString()}`;
}

function dataValue<T>(result: unknown): T {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return (result as { data: T }).data;
}

function responseHeaders(result: unknown) {
  return new Headers((result as { init?: { headers?: HeadersInit } }).init?.headers);
}

function setAuthenticatedUser(user: unknown) {
  jest.mocked(getAuthenticator).mockReturnValue({
    isAuthenticated: jest.fn<() => Promise<unknown>>().mockResolvedValue(user),
  } as never);
  jest.mocked(getSenseiById).mockResolvedValue(user as never);
}

async function consentCookieAndData(url = authorizeUrl()) {
  const result = await loader(createArgs(new Request(url)));
  const screen = dataValue<{ kind: string; csrfToken?: string; parameters: Record<string, string | null> }>(result);
  const setCookie = responseHeaders(result).get("Set-Cookie");
  return { screen, cookie: setCookie?.split(";", 1)[0] ?? "" };
}

function consentPost(
  cookie: string,
  screen: { csrfToken?: string; parameters: Record<string, string | null> },
  decision: string,
  includeCsrf = true,
) {
  const form = new FormData();
  if (includeCsrf) form.set("csrf", screen.csrfToken ?? "");
  const fields: Array<[string, string | null]> = [
    ["response_type", screen.parameters.responseType ?? null],
    ["client_id", screen.parameters.clientId ?? null],
    ["redirect_uri", screen.parameters.redirectUri ?? null],
    ["scope", screen.parameters.scope ?? null],
    ["state", screen.parameters.state ?? null],
    ["code_challenge", screen.parameters.codeChallenge ?? null],
    ["code_challenge_method", screen.parameters.codeChallengeMethod ?? null],
  ];
  for (const [name, value] of fields) if (value !== null) form.set(name, value);
  form.set("decision", decision);
  return new Request("https://mollulog.net/oauth/authorize", {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : undefined,
    body: form,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getOAuthApplicationForClient).mockResolvedValue({ application: application as never, ownerUsername: "developer" });
  jest.mocked(getActiveOAuthGrant).mockResolvedValue(null);
  jest.mocked(issueOAuthAuthorizationCode).mockResolvedValue("mllg_oa_once");
  setAuthenticatedUser(sensei);
});

describe("OAuth authorize route", () => {
  it("renders a first-consent screen and sets no-store and anti-framing headers", async () => {
    const result = await loader(createArgs(new Request(authorizeUrl())));

    expect(dataValue(result)).toMatchObject({
      kind: "consent",
      application: { name: "Roster Tool", ownerUsername: "developer" },
      redirectHost: "tool.example",
      scopes: ["profile"],
      grantedScopes: [],
      username: "testuser",
    });
    const responseHeaderValues = responseHeaders(result);
    expect(responseHeaderValues.get("Cache-Control")).toBe("private, no-store");
    expect(responseHeaderValues.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(responseHeaderValues.get("X-Frame-Options")).toBe("DENY");
    expect(responseHeaderValues.get("Set-Cookie")).toContain("__session=");
  });

  it("shows previously granted rows as additional-scope consent", async () => {
    jest.mocked(getOAuthApplicationForClient).mockResolvedValue({
      application: { ...application, scopes: ["profile", "students:read"] } as never,
      ownerUsername: "developer",
    });
    jest.mocked(getActiveOAuthGrant).mockResolvedValue({ id: 91, scopes: ["profile"] } as never);

    const result = await loader(createArgs(new Request(authorizeUrl({ scope: "profile students:read" }))));

    expect(dataValue(result)).toMatchObject({ kind: "consent", scopes: ["profile", "students:read"], grantedScopes: ["profile"] });
  });

  it("shows the signed-out consent state without issuing a code", async () => {
    setAuthenticatedUser(null);

    const result = await loader(createArgs(new Request(authorizeUrl())));

    expect(dataValue(result)).toMatchObject({ kind: "signed_out", username: null, scopes: ["profile"] });
    expect(issueOAuthAuthorizationCode).not.toHaveBeenCalled();
  });

  it("shows an inline error and does not redirect for an unregistered redirect URI", async () => {
    const result = await loader(createArgs(new Request(authorizeUrl({ redirect_uri: "https://attacker.example/callback" }))));

    expect(dataValue(result)).toEqual({ kind: "invalid", reason: "앱에 등록되지 않은 이동 주소예요." });
    expect(result).not.toBeInstanceOf(Response);
  });

  it("shows the inactive-account state after checking the current database record", async () => {
    setAuthenticatedUser({ ...sensei, active: false });

    const result = await loader(createArgs(new Request(authorizeUrl())));

    expect(dataValue(result)).toMatchObject({ kind: "inactive", username: "testuser", profileStudentId: "arona" });
  });

  it("redirects protocol errors with the supplied state when the redirect URI is valid", async () => {
    const result = await loader(createArgs(new Request(authorizeUrl({ scope: "students:read" }))));

    expect(result).toBeInstanceOf(Response);
    const location = new URL((result as Response).headers.get("Location") ?? "");
    expect(location.origin + location.pathname).toBe(redirectUri);
    expect(location.searchParams.get("error")).toBe("invalid_scope");
    expect(location.searchParams.get("state")).toBe("opaque-state");
  });

  it("returns unsupported_response_type to the registered URI with the original state", async () => {
    const result = await loader(createArgs(new Request(authorizeUrl({ response_type: "token" }))));

    expect(result).toBeInstanceOf(Response);
    const location = new URL((result as Response).headers.get("Location") ?? "");
    expect(location.searchParams.get("error")).toBe("unsupported_response_type");
    expect(location.searchParams.get("state")).toBe("opaque-state");
  });

  it("accepts S256 PKCE and rejects other challenge methods", async () => {
    const challenge = "A".repeat(43);
    const allowed = await loader(
      createArgs(new Request(authorizeUrl({ code_challenge: challenge, code_challenge_method: "S256" }))),
    );
    expect(dataValue(allowed)).toMatchObject({ kind: "consent", parameters: { codeChallenge: challenge } });

    const rejected = await loader(
      createArgs(new Request(authorizeUrl({ code_challenge: challenge, code_challenge_method: "plain" }))),
    );
    expect(rejected).toBeInstanceOf(Response);
    const location = new URL((rejected as Response).headers.get("Location") ?? "");
    expect(location.searchParams.get("error")).toBe("invalid_request");
    expect(location.searchParams.get("state")).toBe("opaque-state");
  });

  it("skips consent when an active grant already contains all requested scopes", async () => {
    jest.mocked(getActiveOAuthGrant).mockResolvedValue({ id: 91, scopes: ["profile"] } as never);

    const result = await loader(createArgs(new Request(authorizeUrl())));

    expect(result).toBeInstanceOf(Response);
    const location = new URL((result as Response).headers.get("Location") ?? "");
    expect(location.searchParams.get("code")).toBe("mllg_oa_once");
    expect(location.searchParams.get("state")).toBe("opaque-state");
    expect(issueOAuthAuthorizationCode).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ applicationId: application.id, userId: 42, scopes: ["profile"], expectedGrantId: 91 }),
      expect.objectContaining({ ctx: "ctx" }) as never,
    );
  });

  it("shows consent again if the grant disconnects before auto-approved code issuance", async () => {
    jest.mocked(getActiveOAuthGrant).mockResolvedValue({ id: 91, scopes: ["profile"] } as never);
    jest.mocked(issueOAuthAuthorizationCode).mockRejectedValue(new OAuthInvalidGrantError("grant disconnected"));

    const result = await loader(createArgs(new Request(authorizeUrl())));

    expect(dataValue(result)).toMatchObject({ kind: "consent", scopes: ["profile"], grantedScopes: [] });
    expect(issueOAuthAuthorizationCode).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ expectedGrantId: 91 }),
      expect.objectContaining({ ctx: "ctx" }) as never,
    );
  });

  it("issues a code only after a valid session-bound allow POST", async () => {
    const challenge = "A".repeat(43);
    const { screen, cookie } = await consentCookieAndData(
      authorizeUrl({ code_challenge: challenge, code_challenge_method: "S256" }),
    );
    const result = await action(createArgs(consentPost(cookie, screen, "allow")));

    expect(result).toBeInstanceOf(Response);
    const location = new URL((result as Response).headers.get("Location") ?? "");
    expect(location.searchParams.get("code")).toBe("mllg_oa_once");
    expect(location.searchParams.get("state")).toBe("opaque-state");
    expect(issueOAuthAuthorizationCode).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ codeChallenge: challenge }),
      expect.objectContaining({ ctx: "ctx" }) as never,
    );
  });

  it("returns access_denied for a valid deny POST", async () => {
    const { screen, cookie } = await consentCookieAndData();
    const result = await action(createArgs(consentPost(cookie, screen, "deny")));

    expect(result).toBeInstanceOf(Response);
    const location = new URL((result as Response).headers.get("Location") ?? "");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("opaque-state");
    expect(issueOAuthAuthorizationCode).not.toHaveBeenCalled();
  });

  it("allows a signed-out user to cancel without a session or CSRF token", async () => {
    setAuthenticatedUser(null);
    const { screen } = await consentCookieAndData();
    expect(screen.kind).toBe("signed_out");
    jest.mocked(getAuthenticator).mockClear();

    const result = await action(createArgs(consentPost("", screen, "deny", false)));

    expect(result).toBeInstanceOf(Response);
    const location = new URL((result as Response).headers.get("Location") ?? "");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("opaque-state");
    expect(getAuthenticator).not.toHaveBeenCalled();
    expect(issueOAuthAuthorizationCode).not.toHaveBeenCalled();
  });

  it("rejects a changed POST parameter even with the original CSRF token", async () => {
    const { screen, cookie } = await consentCookieAndData();
    screen.parameters.state = "changed-state";
    const result = await action(createArgs(consentPost(cookie, screen, "allow")));

    expect(dataValue(result)).toEqual({ kind: "invalid", reason: "요청을 확인할 수 없어요." });
    expect(issueOAuthAuthorizationCode).not.toHaveBeenCalled();
  });

  it("rejects consent if application scopes change after an omitted-scope request was displayed", async () => {
    const url = new URL(authorizeUrl());
    url.searchParams.delete("scope");
    const { screen, cookie } = await consentCookieAndData(url.toString());
    jest.mocked(getOAuthApplicationForClient).mockResolvedValue({
      application: { ...application, scopes: ["profile", "students:read", "students:write"] } as never,
      ownerUsername: "developer",
    });

    const result = await action(createArgs(consentPost(cookie, screen, "allow")));

    expect(dataValue(result)).toEqual({ kind: "invalid", reason: "요청한 권한이 변경됐어요. 다시 확인해주세요." });
    expect(issueOAuthAuthorizationCode).not.toHaveBeenCalled();
  });

  it("keeps the consent endpoint response headers in its route header contract", () => {
    const result = headers({ parentHeaders: new Headers({ "X-Parent": "kept" }) } as never);
    const values = new Headers(result);

    expect(values.get("X-Parent")).toBe("kept");
    expect(values.get("Cache-Control")).toBe("private, no-store");
    expect(values.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(values.get("X-Frame-Options")).toBe("DENY");
  });
});
