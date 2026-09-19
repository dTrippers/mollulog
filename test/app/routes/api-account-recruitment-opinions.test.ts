import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetActiveSensei = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetAuthenticator = jest.fn<(...args: unknown[]) => unknown>();
const mockGetSession = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCommitSession = jest.fn<(...args: unknown[]) => Promise<string>>();
const mockUpdateSensei = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSessionSet = jest.fn();

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: (...args: unknown[]) => mockGetActiveSensei(...args),
  getAuthenticator: (...args: unknown[]) => mockGetAuthenticator(...args),
  sessionStorage: (..._args: unknown[]) => ({
    getSession: (...args: unknown[]) => mockGetSession(...args),
    commitSession: (...args: unknown[]) => mockCommitSession(...args),
  }),
}));
jest.mock("~/models/sensei", () => ({
  updateSensei: (...args: unknown[]) => mockUpdateSensei(...args),
}));

import { action } from "~/routes/api.account.recruitment-opinions";

const env = {} as Env;
const ctx = {} as ExecutionContext;
const activeSensei = {
  id: 7,
  uid: "sensei-7",
  username: "teacher",
  active: true,
  hideRecruitmentOpinions: false,
};

function args(value: unknown) {
  return {
    request: new Request("https://mollulog.test/api/account/recruitment-opinions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
    context: { cloudflare: { env, ctx } },
    params: {},
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue(activeSensei);
  mockGetAuthenticator.mockReturnValue({ sessionKey: "sensei" });
  mockGetSession.mockResolvedValue({ set: mockSessionSet });
  mockCommitSession.mockResolvedValue("session=updated");
  mockUpdateSensei.mockResolvedValue({});
});

describe("api.account.recruitment-opinions", () => {
  it("persists the setting and refreshes the authenticated session value", async () => {
    const response = await action(args({ hideRecruitmentOpinions: true }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, hideRecruitmentOpinions: true });
    expect(mockUpdateSensei).toHaveBeenCalledWith(env, 7, { hideRecruitmentOpinions: true }, { ctx });
    expect(mockSessionSet).toHaveBeenCalledWith("sensei", {
      ...activeSensei,
      hideRecruitmentOpinions: true,
    });
    expect(mockCommitSession).toHaveBeenCalled();
    expect(response.headers.get("Set-Cookie")).toBe("session=updated");
  });

  it("rejects malformed values without changing the account", async () => {
    const response = await action(args({ hideRecruitmentOpinions: "true" }));

    expect(response.status).toBe(400);
    expect(mockUpdateSensei).not.toHaveBeenCalled();
  });
});
