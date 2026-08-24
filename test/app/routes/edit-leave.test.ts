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

function formRequest(username: string) {
  return new Request("https://mollulog.net/edit/leave", {
    method: "POST",
    body: new URLSearchParams({ username }),
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

    const actionResponse = await action(args(formRequest("teacher")));
    expect(actionResponse).toMatchObject({ status: 302, headers: expect.any(Headers) });
    expect((actionResponse as Response).headers.get("Location")).toBe("/unauthorized");
    expect(mockLeaveAccount).not.toHaveBeenCalled();
  });

  it("loads the canonical current username", async () => {
    mockGetSenseiById.mockResolvedValue({ ...sensei, username: "renamed-teacher" });

    await expect(loader(args(new Request("https://mollulog.net/edit/leave")))).resolves.toEqual({
      username: "renamed-teacher",
    });
  });

  it("does not log out or mutate when username confirmation is wrong", async () => {
    mockLeaveAccount.mockResolvedValue({ status: "username_mismatch" });

    const result = await action(args(formRequest("wrong")));

    expect(result).toMatchObject({ init: { status: 400 } });
    expect(mockLeaveAccount).toHaveBeenCalledWith(env, { userId: 7, username: "wrong" }, { ctx: undefined });
    expect(mockGetAuthenticator).not.toHaveBeenCalled();
  });

  it("logs out the current device after a successful account leave", async () => {
    mockLeaveAccount.mockResolvedValue({ status: "left", sessionVersion: 1 });
    const logout = jest.fn(
      async (..._args: unknown[]) => new Response(null, { status: 302, headers: { Location: "/" } }),
    );
    mockGetAuthenticator.mockReturnValue({ logout });

    const result = await action(args(formRequest("teacher")));

    expect(mockLeaveAccount).toHaveBeenCalledWith(env, { userId: 7, username: "teacher" }, { ctx: undefined });
    expect(logout).toHaveBeenCalledWith(expect.any(Request), { redirectTo: "/" });
    expect((result as Response).headers.get("Location")).toBe("/");
  });

  it("expires the current session when logout fails after account leave commits", async () => {
    mockLeaveAccount.mockResolvedValue({ status: "left", sessionVersion: 1 });
    mockGetAuthenticator.mockReturnValue({
      logout: jest.fn(async (..._args: unknown[]) => {
        throw new Error("logout failure");
      }),
    });

    const result = await action(args(formRequest("teacher")));

    expect(result).toMatchObject({ status: 302 });
    expect((result as Response).headers.get("Location")).toBe("/");
    expect((result as Response).headers.get("Set-Cookie")).toContain("__session=;");
  });

  it("returns a retryable safe error and keeps the session on transaction failure", async () => {
    mockLeaveAccount.mockRejectedValue(new Error("database failure"));

    const result = await action(args(formRequest("teacher")));

    expect(result).toMatchObject({ init: { status: 500 } });
    expect(mockGetAuthenticator).not.toHaveBeenCalled();
  });

  it("keeps the destructive link and exact warning copy in the existing settings style", () => {
    const settingsSource = readFileSync("app/routes/edit._index.tsx", "utf8");
    const routeSource = readFileSync("app/routes/edit.leave.tsx", "utf8");
    expect(settingsSource).toContain('to="/edit/leave"');
    expect(settingsSource).toContain('title="회원 탈퇴"');
    expect(routeSource).toContain('variant="danger"');
    expect(routeSource).toContain("탈퇴하면 모든 데이터에 접근할 수 없고 복구할 수 없어요. 정말 진행할까요?");
  });
});
