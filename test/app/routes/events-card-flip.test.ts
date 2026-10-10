import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { LoaderFunctionArgs } from "react-router";
import { getEventMetadata, getEventMinigameType } from "~/models/event-content";
import { loader, meta } from "~/routes/events.$uid.shop.card-flip";

jest.mock("~/models/event-content", () => ({
  getEventMetadata: jest.fn(),
  getEventMinigameType: jest.fn(),
}));

const mockGetEventMetadata = jest.mocked(getEventMetadata);
const mockGetEventMinigameType = jest.mocked(getEventMinigameType);

function loaderArgs(uid?: string): LoaderFunctionArgs {
  return {
    params: uid === undefined ? {} : { uid },
    context: { cloudflare: { env: {}, ctx: {} } },
    request: new Request("https://example.test/events/test/shop/card-flip"),
  } as unknown as LoaderFunctionArgs;
}

describe("card flip detail route loader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEventMetadata.mockResolvedValue({ name: "이벤트" } as never);
    mockGetEventMinigameType.mockResolvedValue("card_flip");
  });

  it("returns 404 if the event UID is missing or the event does not exist", async () => {
    await expect(loader(loaderArgs())).rejects.toMatchObject({ status: 404 });
    expect(mockGetEventMetadata).not.toHaveBeenCalled();

    mockGetEventMetadata.mockResolvedValue(null);
    await expect(loader(loaderArgs("missing"))).rejects.toMatchObject({ status: 404 });
    expect(mockGetEventMinigameType).not.toHaveBeenCalled();
  });

  it("returns 404 for events with a different minigame type", async () => {
    mockGetEventMinigameType.mockResolvedValue("treasure_hunt");

    await expect(loader(loaderArgs("event-1"))).rejects.toMatchObject({ status: 404 });
    expect(mockGetEventMinigameType).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "이벤트" }),
    );
  });

  it("loads a card-flip event identity for the shared shop plan outlet", async () => {
    await expect(loader(loaderArgs("event-1"))).resolves.toEqual({ eventName: "이벤트", eventUid: "event-1" });
  });

  it("uses the event title and card-flip menu label for page metadata", () => {
    expect(meta({ loaderData: { eventName: "이벤트", eventUid: "event-1" } } as never)).toEqual([
      { title: "이벤트 - 카드 뒤집기 | 몰루로그" },
    ]);
  });
});
