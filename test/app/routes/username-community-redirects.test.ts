import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { loader as futuresLoader } from "~/routes/$username.futures";
import { loader as partiesLoader } from "~/routes/$username.parties._index";
import { loader as editPartyLoader } from "~/routes/$username.parties.edit.$id";
import { loader as timelinesLoader } from "~/routes/$username.timelines";

const mockGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));

const context = { cloudflare: { env: {} as Env, ctx: {} as ExecutionContext } };

function args(params: Record<string, string>, path = "/") {
  return { request: new Request(`https://mollulog.test${path}`), context, params } as never;
}

function location(response: unknown) {
  const redirectResponse = response as Response;
  expect(redirectResponse.status).toBe(302);
  return redirectResponse.headers.get("Location");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue(null);
});

describe("former profile routes", () => {
  it("sends the favorite students page to the integrated planner", () => {
    expect(location(futuresLoader())).toBe("/planner");
  });

  it("opens the signed-in user's walkthroughs from their own timelines address", async () => {
    mockGetActiveSensei.mockResolvedValue({ id: 1, username: "sensei" } as never);

    expect(location(await timelinesLoader(args({ username: "@sensei" })))).toBe("/timelines?mine=1");
  });

  it("opens the plain walkthrough list for another user's or a signed-out timelines address", async () => {
    expect(location(await timelinesLoader(args({ username: "@sensei" })))).toBe("/timelines");

    mockGetActiveSensei.mockResolvedValue({ id: 2, username: "other" } as never);
    expect(location(await timelinesLoader(args({ username: "@sensei" })))).toBe("/timelines");
  });

  it("moves the earlier parties address to the view-only community page", () => {
    expect(location(partiesLoader(args({ username: "@sensei" })))).toBe("/timelines/parties/@sensei");
  });

  it("sends the old party editor to the new walkthrough editor or the user's earlier parties", async () => {
    mockGetActiveSensei.mockResolvedValue({ id: 1, username: "sensei" } as never);

    expect(location(await editPartyLoader(args({ id: "new" })))).toBe("/timelines/new");
    expect(location(await editPartyLoader(args({ id: "party-1" })))).toBe("/timelines/parties/@sensei");
  });
});
