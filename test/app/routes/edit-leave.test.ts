import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetActiveSensei = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetAuthenticator = jest.fn<(...args: unknown[]) => unknown>();
const mockLeaveAccount = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetSenseiById = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: (...args: unknown[]) => mockGetActiveSensei(...args),
  getAuthenticator: (...args: unknown[]) => mockGetAuthenticator(...args),
  sessionStorage: (storageEnv: { SESSION_SECRET: string }) => {
    const { createCookieSessionStorage } = jest.requireActual<typeof import("react-router")>("react-router");
    return createCookieSessionStorage({
      cookie: {
        name: "__session",
        path: "/",
        httpOnly: true,
        secure: true,
        secrets: [storageEnv.SESSION_SECRET],
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60,
      },
    });
  },
  sessionValidationStorage: (storageEnv: { SESSION_SECRET: string }) => {
    const { createCookieSessionStorage } = jest.requireActual<typeof import("react-router")>("react-router");
    return createCookieSessionStorage({
      cookie: {
        name: "__session_validation",
        path: "/",
        httpOnly: true,
        secure: true,
        secrets: [storageEnv.SESSION_SECRET],
        sameSite: "lax",
        maxAge: 15 * 60,
      },
    });
  },
}));
jest.mock("~/models/account-security", () => ({
  leaveAccount: (...args: unknown[]) => mockLeaveAccount(...args),
}));
jest.mock("~/models/sensei", () => ({
  getSenseiById: (...args: unknown[]) => mockGetSenseiById(...args),
}));
jest.mock("~/lib/observability.server", () => ({
  getLogger: () => ({ error: jest.fn() }),
}));

import { action, loader } from "../../../app/routes/edit.leave";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" }, SESSION_SECRET: "test-secret" } as unknown as Env;
const sensei = { id: 7, username: "teacher", active: true };

function args(request: Request) {
  return {
    request,
    context: { cloudflare: { env } },
    params: {},
  } as never;
}

function formRequest() {
  return new Request("https://mollulog.net/edit/leave", {
    method: "POST",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue(sensei);
  mockGetSenseiById.mockResolvedValue({ ...sensei });
});

describe("edit.leave", () => {
  it("keeps unauthenticated users out of the screen and action", async () => {
    mockGetActiveSensei.mockResolvedValue(null);

    const loaderResponse = await loader(args(new Request("https://mollulog.net/edit/leave")));
    expect(loaderResponse).toMatchObject({ status: 302, headers: expect.any(Headers) });
    expect((loaderResponse as Response).headers.get("Location")).toBe("/unauthorized");

    const actionResponse = await action(args(formRequest()));
    expect(actionResponse).toMatchObject({ status: 302, headers: expect.any(Headers) });
    expect((actionResponse as Response).headers.get("Location")).toBe("/unauthorized");
    expect(mockLeaveAccount).not.toHaveBeenCalled();
  });

  it("keeps inactive accounts out of the screen", async () => {
    mockGetSenseiById.mockResolvedValue({ ...sensei, active: false });

    const response = await loader(args(new Request("https://mollulog.net/edit/leave")));

    expect(response).toMatchObject({ status: 302, headers: expect.any(Headers) });
    expect((response as Response).headers.get("Location")).toBe("/unauthorized");
  });

  it("logs out the current device after a successful account leave", async () => {
    mockLeaveAccount.mockResolvedValue({ status: "left" });
    const logout = jest.fn(async (_request: Request, options: { redirectTo: string; headers?: HeadersInit }) => {
      const headers = new Headers(options.headers);
      headers.append("Set-Cookie", "__session=; Max-Age=0; Path=/");
      headers.set("Location", options.redirectTo);
      throw new Response(null, { status: 302, headers });
    });
    mockGetAuthenticator.mockReturnValue({ logout });

    const result = await action(args(formRequest()));

    expect(mockLeaveAccount).toHaveBeenCalledWith(env, { userId: 7 }, { ctx: undefined });
    expect(logout).toHaveBeenCalledWith(expect.any(Request), {
      redirectTo: "/?account=left",
      headers: expect.any(Headers),
    });
    expect((result as Response).headers.get("Location")).toBe("/?account=left");
    expect((result as Response).headers.getSetCookie()).toEqual(
      expect.arrayContaining([expect.stringMatching(/^__session=/), expect.stringMatching(/^__session_validation=/)]),
    );
  });

  it("expires the current session when logout fails after account leave commits", async () => {
    mockLeaveAccount.mockResolvedValue({ status: "left" });
    mockGetAuthenticator.mockReturnValue({
      logout: jest.fn(async (..._args: unknown[]) => {
        throw new Error("logout failure");
      }),
    });

    const result = await action(args(formRequest()));

    expect(result).toMatchObject({ status: 302 });
    expect((result as Response).headers.get("Location")).toBe("/?account=left");
    expect((result as Response).headers.getSetCookie()).toEqual(
      expect.arrayContaining([expect.stringMatching(/^__session=/), expect.stringMatching(/^__session_validation=/)]),
    );
  });

  it("returns a retryable safe error and keeps the session on transaction failure", async () => {
    mockLeaveAccount.mockRejectedValue(new Error("database failure"));

    const result = await action(args(formRequest()));

    expect(result).toMatchObject({ init: { status: 500 } });
    expect(mockGetAuthenticator).not.toHaveBeenCalled();
  });

  it("keeps the destructive link and a simple account-leave graphic in the existing settings style", () => {
    const settingsSource = readFileSync("app/routes/edit._index.tsx", "utf8");
    const routeSource = readFileSync("app/routes/edit.leave.tsx", "utf8");
    const leaveNoticeSource = readFileSync("app/routes/edit.leave._components/AccountLeaveNotice.tsx", "utf8");
    const homeSource = readFileSync("app/routes/_index.tsx", "utf8");
    expect(settingsSource).toContain('to="/edit/leave"');
    expect(settingsSource).toContain('title="회원 탈퇴"');
    expect(routeSource).toContain('variant="danger"');
    expect(routeSource).toContain("AccountLeaveNotice");
    expect(routeSource).not.toContain('name="username"');
    expect(leaveNoticeSource).toContain("UserMinusIcon");
    expect(leaveNoticeSource).toContain("탈퇴하면 모든 데이터에 접근할 수 없고 복구할 수 없어요. 정말 진행할까요?");
    expect(homeSource).toContain('description="회원 탈퇴가 완료됐어요."');
  });
});
