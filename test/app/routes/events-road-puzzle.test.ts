import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetEventMetadata = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetEventMinigameType = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetEventShopContentForMetadata = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/models/event-content", () => ({
  getEventMetadata: mockGetEventMetadata,
  getEventMinigameType: mockGetEventMinigameType,
  getEventShopContentForMetadata: mockGetEventShopContentForMetadata,
}));

import { loader } from "~/routes/events.$uid.road-puzzle";

const env = {} as Env;
const ctx = {} as ExecutionContext;

function loaderArgs(uid = "event-1") {
  return {
    params: { uid },
    context: { cloudflare: { env, ctx } },
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetEventMetadata.mockResolvedValue({
    name: "Event",
    runType: "first",
    contentUid: "content-1",
    shopContentUid: null,
  });
  mockGetEventMinigameType.mockResolvedValue("road_puzzle");
  mockGetEventShopContentForMetadata.mockResolvedValue({
    minigameConfig: {
      minigameType: "road_puzzle",
      payment: { resourceType: "Item", resourceUid: "sticker", resourceName: "하이랜더 기념 스티커", quantity: 150 },
      roadPuzzle: { maps: [], rounds: [], instantClearRound: 7, railSetReward: [] },
    },
  });
});

describe("road puzzle viewer loader", () => {
  it("returns road-puzzle map data for the independent viewer route", async () => {
    const result = await loader(loaderArgs());
    expect(result).toMatchObject({
      eventName: "Event",
      config: { maps: [], rounds: [], instantClearRound: 7, railSetReward: [] },
      payment: { resourceUid: "sticker", quantity: 150 },
    });
  });

  it("returns 404 for other event minigame types", async () => {
    mockGetEventMinigameType.mockResolvedValue("dice");
    await expect(loader(loaderArgs())).rejects.toHaveProperty("status", 404);
  });

  it("returns 404 when the event does not exist", async () => {
    mockGetEventMetadata.mockResolvedValue(null);
    await expect(loader(loaderArgs())).rejects.toHaveProperty("status", 404);
    expect(mockGetEventMinigameType).not.toHaveBeenCalled();
  });
});
