import { describe, expect, it, jest } from "@jest/globals";

jest.mock("~/auth/authenticator.server", () => ({ getAuthenticator: jest.fn() }));
jest.mock("~/models/sensei", () => ({ getSenseiById: jest.fn() }));

import { getAuthenticator } from "~/auth/authenticator.server";
import { getSenseiById } from "~/models/sensei";
import { requireOAuthAppManager } from "~/routes/developers._components/requireOAuthAppManager";

function setSessionSensei(sensei: unknown) {
  jest.mocked(getAuthenticator).mockReturnValue({
    isAuthenticated: jest.fn<() => Promise<unknown>>().mockResolvedValue(sensei),
  } as never);
}

describe("OAuth application manager guard", () => {
  it("rechecks active status and role from the database", async () => {
    setSessionSensei({ id: 42, active: true });
    jest.mocked(getSenseiById).mockResolvedValue({ id: 42, active: true, role: "app_developer" } as never);

    await expect(requireOAuthAppManager({} as Env, new Request("https://mollulog.net"), "ctx" as never)).resolves.toBe(42);
    expect(getSenseiById).toHaveBeenCalledWith({} as never, 42, { ctx: "ctx" } as never);

    jest.mocked(getSenseiById).mockResolvedValue({ id: 42, active: true, role: "guest" } as never);
    const denied = await requireOAuthAppManager({} as Env, new Request("https://mollulog.net"));
    expect(denied).toBeInstanceOf(Response);
    expect((denied as Response).headers.get("Location")).toBe("/developers");
  });

  it("sends signed-out visitors to developers and keeps inactive accounts unauthorized", async () => {
    jest.mocked(getSenseiById).mockClear();
    setSessionSensei(null);
    const signedOut = await requireOAuthAppManager({} as Env, new Request("https://mollulog.net"));
    expect((signedOut as Response).headers.get("Location")).toBe("/developers");
    expect(getSenseiById).not.toHaveBeenCalled();

    setSessionSensei({ id: 42, active: true });
    jest.mocked(getSenseiById).mockResolvedValue({ id: 42, active: false, role: "app_developer" } as never);
    const inactive = await requireOAuthAppManager({} as Env, new Request("https://mollulog.net"));
    expect((inactive as Response).headers.get("Location")).toBe("/unauthorized");
  });
});
