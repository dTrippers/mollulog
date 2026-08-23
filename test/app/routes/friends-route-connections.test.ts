import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetActiveSensei = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRouteSensei = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetFollowershipLists = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: (...args: unknown[]) => mockGetActiveSensei(...args),
}));
jest.mock("~/models/followership", () => ({
  getFollowershipLists: (...args: unknown[]) => mockGetFollowershipLists(...args),
}));
jest.mock("../../../app/routes/$username._components/route-sensei.server", () => ({
  getRouteSensei: (...args: unknown[]) => mockGetRouteSensei(...args),
}));

import { loader } from "../../../app/routes/$username.friends";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 9, username: "viewer" });
  mockGetRouteSensei.mockResolvedValue({ id: 7, username: "profile" });
  mockGetFollowershipLists.mockResolvedValue({ following: [], followers: [] });
});

describe("friends route identity connection budget", () => {
  it("uses one profile lookup and one combined relationship operation", async () => {
    const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as unknown as Env;
    const ctx = {} as ExecutionContext;
    await expect(
      loader({
        context: { cloudflare: { env, ctx } },
        request: new Request("https://mollulog.test/@profile/friends"),
        params: { username: "@profile" },
      } as never),
    ).resolves.toEqual({ following: [], followers: [] });

    expect(mockGetRouteSensei).toHaveBeenCalledTimes(1);
    expect(mockGetRouteSensei).toHaveBeenCalledWith(env, { username: "@profile" }, 9, { ctx });
    expect(mockGetFollowershipLists).toHaveBeenCalledTimes(1);
    expect(mockGetFollowershipLists).toHaveBeenCalledWith(env, 7, 9, { ctx });
    expect(mockGetRouteSensei.mock.calls.length + mockGetFollowershipLists.mock.calls.length).toBe(2);
  });
});
