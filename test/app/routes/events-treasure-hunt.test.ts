import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { LoaderFunctionArgs } from "react-router";
import { getEventMetadata, getEventShopContentForMetadata } from "~/models/event-content";
import { loader } from "~/routes/events.$uid.treasure-hunt";

jest.mock("~/models/event-content", () => ({
  getEventMetadata: jest.fn(),
  getEventShopContentForMetadata: jest.fn(),
}));

const mockGetEventMetadata = jest.mocked(getEventMetadata);
const mockGetEventShopContent = jest.mocked(getEventShopContentForMetadata);

function loaderArgs(uid?: string): LoaderFunctionArgs {
  return {
    params: uid === undefined ? {} : { uid },
    context: { cloudflare: { env: {}, ctx: {} } },
    request: new Request("https://example.test/events/test/treasure-hunt"),
  } as unknown as LoaderFunctionArgs;
}

describe("treasure hunt simulator route loader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEventMetadata.mockResolvedValue({ name: "백에서 피어난 한 송이" } as never);
    mockGetEventShopContent.mockResolvedValue({
      minigameConfig: { minigameType: "treasure_hunt", treasureHunt: null },
    } as never);
  });

  it("returns 404 for a non-treasure-hunt event", async () => {
    mockGetEventShopContent.mockResolvedValue({ minigameConfig: { minigameType: "dice" } } as never);

    await expect(loader(loaderArgs("10847"))).rejects.toMatchObject({ status: 404 });
  });

  it("returns the explicit no-data state for a treasure-hunt event without board data", async () => {
    await expect(loader(loaderArgs("10847"))).resolves.toMatchObject({
      eventName: "백에서 피어난 한 송이",
      eventUid: "10847",
      treasureHunt: null,
    });
  });

  it("returns 404 when the event cannot be found", async () => {
    mockGetEventMetadata.mockResolvedValue(null);

    await expect(loader(loaderArgs("missing"))).rejects.toMatchObject({ status: 404 });
    expect(mockGetEventShopContent).not.toHaveBeenCalled();
  });
});
