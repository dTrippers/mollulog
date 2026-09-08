import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetActiveSensei = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetAuthenticator = jest.fn<(...args: unknown[]) => unknown>();
const mockDeactivateSubscriptionFromCookie = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockLogout = jest.fn<(...args: unknown[]) => Promise<Response>>();

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: (...args: unknown[]) => mockGetActiveSensei(...args),
  getAuthenticator: (...args: unknown[]) => mockGetAuthenticator(...args),
}));
jest.mock("~/models/web-push-notifications.server", () => ({
  ...jest.requireActual<typeof import("~/models/web-push-notifications.server")>(
    "~/models/web-push-notifications.server",
  ),
  deactivateSubscriptionFromCookie: (...args: unknown[]) => mockDeactivateSubscriptionFromCookie(...args),
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

function signoutRequest(init: RequestInit = {}) {
  return new Request("https://mollulog.net/signout", {
    method: "POST",
    headers: { Cookie: `mollulog_web_push_fingerprint=${fingerprint}`, ...(init.headers ?? {}) },
    ...init,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue(sensei);
  mockDeactivateSubscriptionFromCookie.mockResolvedValue(undefined);
  mockLogout.mockResolvedValue(new Response(null, { status: 302, headers: { Location: "/" } }));
  mockGetAuthenticator.mockReturnValue({ logout: mockLogout });
});

describe("signout", () => {
  it("keeps GET side-effect free and uses the explicit profile mutation", async () => {
    const response = await loader(args(new Request("https://mollulog.net/signout")));
    expect(response).toMatchObject({ status: 302 });
    expect((response as Response).headers.get("Location")).toBe("/edit");
    expect(mockDeactivateSubscriptionFromCookie).not.toHaveBeenCalled();
    const routeSource = readFileSync("app/routes/signout.tsx", "utf8");
    const profileSource = readFileSync("app/routes/edit._index.tsx", "utf8");
    expect(routeSource).toContain("isSameOriginMutation(request)");
    expect(routeSource).toContain('request.method !== "POST"');
    expect(profileSource).toContain('<fetcher.Form method="post" action="/signout">');
  });

  it("deactivates the current browser before completing logout", async () => {
    const result = await action(args(signoutRequest()));

    expect(mockDeactivateSubscriptionFromCookie).toHaveBeenCalledWith(env, 7, fingerprint, { ctx: undefined });
    expect(mockLogout).toHaveBeenCalled();
    expect((result as Response).status).toBe(302);
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
    expect(mockDeactivateSubscriptionFromCookie).not.toHaveBeenCalled();
    expect(mockGetAuthenticator).not.toHaveBeenCalled();
  });

  it("keeps the session when browser subscription cleanup fails", async () => {
    mockDeactivateSubscriptionFromCookie.mockRejectedValue(new Error("database unavailable"));

    const result = await action(args(signoutRequest()));

    expect(result).toMatchObject({ init: { status: 500 } });
    expect(mockGetAuthenticator).not.toHaveBeenCalled();
  });
});
