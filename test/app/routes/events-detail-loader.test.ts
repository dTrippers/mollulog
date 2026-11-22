import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { LoaderFunctionArgs } from "react-router";
import { getEventMetadata, getEventMinigameType, getShopAvailableEvents } from "~/models/event-content";
import { getActiveEventDetailTab, loader } from "~/routes/events.$uid";
import type { getEventShopAvailability } from "~/routes/events.$uid._components/event-shop-availability";

jest.mock("~/models/event-content", () => ({
  getEventMetadata: jest.fn(),
  getEventMinigameType: jest.fn(),
  getShopAvailableEvents: jest.fn(),
}));
jest.mock("~/routes/events.$uid._components/event-shop-availability", () => ({
  getEventShopAvailability: jest.fn<typeof getEventShopAvailability>().mockResolvedValue("ready"),
}));

const mockGetEventMetadata = jest.mocked(getEventMetadata);
const mockGetEventMinigameType = jest.mocked(getEventMinigameType);
const mockGetShopAvailableEvents = jest.mocked(getShopAvailableEvents);
const env = {} as Env;

type EventMetadata = NonNullable<Awaited<ReturnType<typeof getEventMetadata>>>;

function createMetadata(overrides: Partial<EventMetadata> = {}): EventMetadata {
  return {
    name: "이벤트",
    contentType: "event",
    runType: "first",
    since: "2026-01-01T00:00:00.000Z",
    until: null,
    contentUid: "event-content",
    shopContentUid: "shop-content",
    recruitmentGroupUid: null,
    isSpoiler: false,
    shopAvailable: true,
    ...overrides,
  };
}

function loaderArgs(path = "/events/event-1"): LoaderFunctionArgs {
  return {
    params: { uid: "event-1" },
    context: { cloudflare: { env, ctx: {} } },
    request: new Request(`https://mollulog.test${path}`),
  } as unknown as LoaderFunctionArgs;
}

describe("event detail route loader minigame type", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEventMinigameType.mockResolvedValue("treasure_hunt");
    mockGetShopAvailableEvents.mockResolvedValue([]);
  });

  it("keeps the common event loader contract while using the minigame type model", async () => {
    const metadata = createMetadata();
    mockGetEventMetadata.mockResolvedValue(metadata);

    await expect(loader(loaderArgs("/events/event-1/treasure-hunt"))).resolves.toMatchObject({
      eventMetadata: metadata,
      minigameType: "treasure_hunt",
      shopAvailableEvents: [],
    });

    expect(mockGetEventMinigameType).toHaveBeenCalledWith(env, metadata);
    expect(mockGetShopAvailableEvents).not.toHaveBeenCalled();
  });

  it("loads the event selector on the overview, keeping the event even without a shop", async () => {
    const metadata = createMetadata({ shopAvailable: false });
    mockGetEventMetadata.mockResolvedValue(metadata);

    await expect(loader(loaderArgs())).resolves.toMatchObject({
      shopAvailableEvents: [
        { uid: "event-1", name: "이벤트", since: "2026-01-01T00:00:00.000Z", until: null, isSpoiler: false },
      ],
    });
    expect(mockGetShopAvailableEvents).toHaveBeenCalledTimes(1);
  });

  it("permanently redirects live content and keeps the query string", async () => {
    mockGetEventMetadata.mockResolvedValue(createMetadata({ contentType: "live" }));

    const response = await loader(loaderArgs("/events/event-1?source=future"));

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(301);
    expect((response as Response).headers.get("Location")).toBe("/lives/event-1?source=future");
    expect(mockGetEventMinigameType).not.toHaveBeenCalled();
  });
});

describe("event detail tabs", () => {
  it.each([
    ["/events/event-1", "overview"],
    ["/events/event-1/shop", "shop"],
    ["/events/event-1/recruitment-simulator", "simulator"],
    ["/events/event-1/shop/card-flip", "card-flip"],
    ["/events/event-1/treasure-hunt", "treasure-hunt"],
  ] as const)("marks only the %s screen active", (pathname, expected) => {
    expect(getActiveEventDetailTab(pathname, "event-1")).toBe(expected);
  });

  it("does not treat the card flip route as the shop tab", () => {
    expect(getActiveEventDetailTab("/events/event-1/shop/card-flip", "event-1")).not.toBe("shop");
  });
});
