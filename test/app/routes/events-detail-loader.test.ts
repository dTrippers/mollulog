import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { LoaderFunctionArgs } from "react-router";
import { getEventMetadata, getEventMinigameType, getShopAvailableEvents } from "~/models/event-content";
import { loader } from "~/routes/events.$uid";

jest.mock("~/models/event-content", () => ({
  getEventMetadata: jest.fn(),
  getEventMinigameType: jest.fn(),
  getShopAvailableEvents: jest.fn(),
}));
jest.mock("~/components/features/events", () => ({ PanelEventSelector: () => null }));
jest.mock("~/components/features/layout", () => ({ Page: () => null }));

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

    await expect(loader(loaderArgs())).resolves.toMatchObject({
      eventMetadata: metadata,
      minigameType: "treasure_hunt",
      shopAvailableEvents: [],
    });

    expect(mockGetEventMinigameType).toHaveBeenCalledWith(env, metadata);
    expect(mockGetShopAvailableEvents).not.toHaveBeenCalled();
  });

  it("does not query a minigame type for live content", async () => {
    mockGetEventMetadata.mockResolvedValue(createMetadata({ contentType: "live" }));

    await expect(loader(loaderArgs())).resolves.toMatchObject({ minigameType: null });
    expect(mockGetEventMinigameType).not.toHaveBeenCalled();
  });
});
