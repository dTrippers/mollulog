import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetActiveSensei = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetAuthenticator = jest.fn<(...args: unknown[]) => unknown>();
const mockDeactivateSubscriptionsForSignout = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockLogout = jest.fn<(...args: unknown[]) => Promise<Response>>();

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: (...args: unknown[]) => mockGetActiveSensei(...args),
  getAuthenticator: (...args: unknown[]) => mockGetAuthenticator(...args),
}));
jest.mock("~/models/web-push-notifications.server", () => ({
  ...jest.requireActual<typeof import("~/models/web-push-notifications.server")>(
    "~/models/web-push-notifications.server",
  ),
  deactivateSubscriptionsForSignout: (...args: unknown[]) => mockDeactivateSubscriptionsForSignout(...args),
}));
jest.mock("~/lib/observability.server", () => ({
  getLogger: () => ({ error: jest.fn() }),
}));

import { action, loader } from "../../../app/routes/signout";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as unknown as Env;
const sensei = { id: 7, username: "teacher", active: true };
const fingerprint = "A".repeat(43);

function args(request: Request) {
  return {
    request,
    context: { cloudflare: { env, ctx: undefined } },
    params: {},
  } as never;
}

function signoutRequest(
  init: RequestInit = {},
  endpoint?: string | null,
  cookieFingerprint: string | null = fingerprint,
) {
  return new Request("https://mollulog.net/signout", {
    ...init,
    method: "POST",
    headers: {
      ...(cookieFingerprint === null ? {} : { Cookie: `mollulog_web_push_fingerprint=${cookieFingerprint}` }),
      ...(endpoint === undefined ? {} : { "Content-Type": "application/json" }),
      ...(init.headers ?? {}),
    },
    body: endpoint === undefined ? init.body : JSON.stringify({ endpoint }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue(sensei);
  mockDeactivateSubscriptionsForSignout.mockResolvedValue(undefined);
  mockLogout.mockResolvedValue(new Response(null, { status: 302, headers: { Location: "/" } }));
  mockGetAuthenticator.mockReturnValue({ logout: mockLogout });
});

describe("signout", () => {
  it("keeps GET side-effect free and uses the explicit profile mutation", async () => {
    const response = await loader(args(new Request("https://mollulog.net/signout")));
    expect(response).toMatchObject({ status: 302 });
    expect((response as Response).headers.get("Location")).toBe("/edit");
    expect(mockDeactivateSubscriptionsForSignout).not.toHaveBeenCalled();
    const routeSource = readFileSync("app/routes/signout.tsx", "utf8");
    const profileSource = readFileSync("app/routes/edit._index.tsx", "utf8");
    expect(routeSource).toContain("isSameOriginMutation(request)");
    expect(routeSource).toContain('request.method !== "POST"');
    expect(profileSource).toContain('<fetcher.Form method="post" action="/signout"');
    expect(profileSource).toContain('"serviceWorker" in navigator && "PushManager" in window');
  });

  it("deactivates the current browser before completing logout", async () => {
    const endpoint = "https://push.example.test/send/abc";
    const result = await action(args(signoutRequest({}, endpoint)));

    expect(mockDeactivateSubscriptionsForSignout).toHaveBeenCalledWith(env, 7, endpoint, fingerprint, {
      ctx: undefined,
    });
    expect(mockLogout).toHaveBeenCalled();
    expect((result as Response).status).toBe(302);
    const logoutOptions = mockLogout.mock.calls[0]?.[1] as { headers: Headers };
    expect(logoutOptions.headers.get("Set-Cookie")).toContain("mollulog_web_push_fingerprint=");
  });

  it("uses the live endpoint when the fingerprint cookie is absent", async () => {
    const endpoint = "https://push.example.test/send/no-cookie";
    const result = await action(args(signoutRequest({}, endpoint, null)));

    expect(mockDeactivateSubscriptionsForSignout).toHaveBeenCalledWith(env, 7, endpoint, null, {
      ctx: undefined,
    });
    expect(mockLogout).toHaveBeenCalled();
    expect((result as Response).status).toBe(302);
    const logoutOptions = mockLogout.mock.calls[0]?.[1] as { headers: Headers };
    expect(logoutOptions.headers.get("Set-Cookie")).toContain("mollulog_web_push_fingerprint=");
  });

  it("rejects cross-origin mutations without touching the session or subscription", async () => {
    const result = await action(
      args(
        signoutRequest({
          headers: {
            Cookie: `mollulog_web_push_fingerprint=${fingerprint}`,
            Origin: "https://evil.example",
          },
        }),
      ),
    );

    expect(result).toMatchObject({ init: { status: 403 } });
    expect(mockGetActiveSensei).not.toHaveBeenCalled();
    expect(mockDeactivateSubscriptionsForSignout).not.toHaveBeenCalled();
    expect(mockGetAuthenticator).not.toHaveBeenCalled();
  });

  it("keeps the session when browser subscription cleanup fails", async () => {
    mockDeactivateSubscriptionsForSignout.mockRejectedValue(new Error("database unavailable"));

    const result = await action(args(signoutRequest()));

    expect(result).toMatchObject({ init: { status: 500 } });
    expect(mockGetAuthenticator).not.toHaveBeenCalled();
  });

  it("rejects a malformed optional endpoint without logging out", async () => {
    const result = await action(args(signoutRequest({}, "http://push.example.test/send/abc")));

    expect(result).toMatchObject({ init: { status: 400 } });
    expect(mockDeactivateSubscriptionsForSignout).not.toHaveBeenCalled();
    expect(mockGetAuthenticator).not.toHaveBeenCalled();
  });

  it("deactivates both endpoint and stale cookie fingerprints when they differ", async () => {
    const endpoint = "https://push.example.test/send/other";
    await action(args(signoutRequest({}, endpoint)));

    expect(mockDeactivateSubscriptionsForSignout).toHaveBeenCalledWith(env, 7, endpoint, fingerprint, {
      ctx: undefined,
    });
  });
});
