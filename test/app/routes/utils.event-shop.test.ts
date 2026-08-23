import { describe, expect, it, jest } from "@jest/globals";
import { getShopAvailableEvents } from "~/models/event-content";
import { loader } from "../../../app/routes/utils.event-shop";

jest.mock("~/models/event-content", () => ({
  getShopAvailableEvents: jest.fn(),
}));

jest.mock("~/lib/date-time", () => ({
  ...jest.requireActual<typeof import("~/lib/date-time")>("~/lib/date-time"),
  nowUtcIso: () => "2026-08-18T00:00:00.000Z",
}));

const mockedGetShopAvailableEvents = getShopAvailableEvents as jest.MockedFunction<typeof getShopAvailableEvents>;

const args = {
  context: {
    cloudflare: {
      env: { HYPERDRIVE: { connectionString: "postgres://test" } },
      ctx: {},
    },
  },
  params: {},
  request: new Request("https://mollulog.net/utils/event-shop"),
} as never;

describe("utils.event-shop loader", () => {
  it("redirects to an ongoing event shop", async () => {
    mockedGetShopAvailableEvents.mockResolvedValueOnce([
      {
        uid: "upcoming",
        name: "Upcoming",
        isSpoiler: false,
        since: "2026-08-19T00:00:00.000Z",
        until: "2026-08-20T00:00:00.000Z",
      },
      {
        uid: "ongoing",
        name: "Ongoing",
        isSpoiler: false,
        since: "2026-08-17T00:00:00.000Z",
        until: "2026-08-19T00:00:00.000Z",
      },
    ]);

    const response = await loader(args);
    expect(response).not.toBeNull();
    if (!response) {
      throw new Error("Expected a redirect response");
    }
    expect(response).toMatchObject({ status: 302 });
    expect(response.headers.get("Location")).toBe("/events/ongoing/shop");
  });

  it("keeps the utility screen when no candidate exists", async () => {
    mockedGetShopAvailableEvents.mockResolvedValueOnce([]);

    await expect(loader(args)).resolves.toBeNull();
  });
});
