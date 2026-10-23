import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("~/models/mollulog-oauth", () => ({
  ...jest.requireActual<typeof import("~/models/mollulog-oauth")>("~/models/mollulog-oauth"),
  exchangeOAuthAuthorizationCode: jest.fn(),
}));

import { handleOAuthTokenRequest } from "~/api/oauth-token.server";
import { exchangeOAuthAuthorizationCode } from "~/models/mollulog-oauth";

const mockedExchange = jest.mocked(exchangeOAuthAuthorizationCode);
const env = { HYPERDRIVE: { connectionString: "postgres://test" } } as unknown as Env;

function tokenRequest(body: string, headers: HeadersInit = {}) {
  return new Request("https://api.mollulog.net/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...Object.fromEntries(new Headers(headers)) },
    body,
  });
}

describe("OAuth token endpoint", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedExchange.mockResolvedValue({
      accessToken: `mllg_ot_${"a".repeat(64)}`,
      scopes: ["profile", "students:read", "students:write"],
      expiresIn: 31_536_000,
    });
  });

  it("exchanges a form-encoded authorization code using client credentials in the body", async () => {
    const response = await handleOAuthTokenRequest(
      tokenRequest(
        "grant_type=authorization_code&code=code-value&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&client_id=mllg_oc_id&client_secret=mllg_os_secret",
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(await response.json()).toEqual({
      access_token: `mllg_ot_${"a".repeat(64)}`,
      token_type: "Bearer",
      expires_in: 31_536_000,
      scope: "profile students:read students:write",
    });
    expect(mockedExchange).toHaveBeenCalledWith(
      env,
      {
        clientId: "mllg_oc_id",
        clientSecret: "mllg_os_secret",
        code: "code-value",
        redirectUri: "https://example.com/callback",
        codeVerifier: null,
      },
      { ctx: undefined },
    );
  });

  it("supports client_secret_basic and forwards a PKCE verifier", async () => {
    const authorization = `Basic ${btoa("mllg_oc_id:mllg_os_secret")}`;
    const response = await handleOAuthTokenRequest(
      tokenRequest(
        "grant_type=authorization_code&code=code-value&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&code_verifier=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~",
        { Authorization: authorization },
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(mockedExchange).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        clientId: "mllg_oc_id",
        clientSecret: "mllg_os_secret",
        codeVerifier: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~",
      }),
      { ctx: undefined },
    );
  });

  it("returns RFC 6749 error responses without CORS headers", async () => {
    const unsupported = await handleOAuthTokenRequest(tokenRequest("grant_type=client_credentials"), env);
    const missingClient = await handleOAuthTokenRequest(
      tokenRequest("grant_type=authorization_code&code=code&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback"),
      env,
    );

    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toMatchObject({ error: "unsupported_grant_type" });
    expect(missingClient.status).toBe(401);
    expect(await missingClient.json()).toMatchObject({ error: "invalid_client" });
    expect(missingClient.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
