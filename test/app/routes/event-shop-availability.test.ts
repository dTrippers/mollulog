import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { EventShopMetadata } from "~/models/event-content";
import { getEventContentSchedule, getEventShopContentForMetadata } from "~/models/event-content";
import {
  getEventShopAvailability,
  getEventShopPortalData,
} from "~/routes/events.$uid._components/event-shop-availability";

jest.mock("~/models/event-content", () => ({
  getEventContentSchedule: jest.fn(),
  getEventShopContentForMetadata: jest.fn(),
}));

const mockSchedule = jest.mocked(getEventContentSchedule);
const mockShopContent = jest.mocked(getEventShopContentForMetadata);
const env = {} as Env;

function metadata(overrides: Partial<EventShopMetadata> = {}): EventShopMetadata {
  return {
    name: "테스트 이벤트",
    contentType: "event",
    runType: "first",
    since: "2099-10-01T00:00:00.000Z",
    until: "2099-10-31T00:00:00.000Z",
    contentUid: "event-1",
    shopContentUid: "shop-1",
    recruitmentGroupUid: null,
    isSpoiler: false,
    shopAvailable: true,
    ...overrides,
  };
}

function shopContent(resourceCount = 1) {
  const shopResources = Array.from({ length: resourceCount }, (_, index) => ({
    paymentResource: { uid: `currency-${index}`, type: "item", name: `재화 ${index}`, imageUrl: null },
    purchaseTiers: [],
  }));
  return { shopResources } as never;
}

describe("event shop availability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSchedule.mockResolvedValue(null);
  });

  it("distinguishes missing shop data from an ended shop", async () => {
    mockShopContent.mockResolvedValueOnce(null).mockResolvedValueOnce(shopContent());

    await expect(getEventShopAvailability(env, metadata())).resolves.toBe("no-data");
    await expect(getEventShopAvailability(env, metadata({ until: "2020-01-01T00:00:00.000Z" }))).resolves.toBe("ended");
  });

  it("returns at most four unique purchase currencies for a ready shop", async () => {
    mockShopContent.mockResolvedValue(shopContent(6));

    const result = await getEventShopPortalData(env, metadata());

    expect(result.status).toBe("ready");
    expect(result.currencies).toHaveLength(4);
    expect(new Set(result.currencies.map(({ uid }) => uid)).size).toBe(4);
  });

  it("reports lookup failures as unavailable instead of no-data", async () => {
    mockShopContent.mockRejectedValue(new Error("upstream unavailable"));

    await expect(getEventShopAvailability(env, metadata())).resolves.toBe("unavailable");
    await expect(getEventShopPortalData(env, metadata({ shopAvailable: false }))).resolves.toMatchObject({
      status: "no-data",
      currencies: [],
    });
  });
});
