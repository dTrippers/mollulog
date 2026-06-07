import { describe, expect, it } from "@jest/globals";
import { buildEventShopStateIdentity } from "./event-shop-state-key";

describe("buildEventShopStateIdentity", () => {
  it("uses the timeline UID as the state key when no shop content UID exists", () => {
    expect(
      buildEventShopStateIdentity({
        timelineUid: "steel-continent",
        shopContentUid: null,
      }),
    ).toEqual({
      shopStateUid: "steel-continent",
      fallbackStateUid: null,
    });
  });

  it("uses shopContentUid as the shared state key and keeps the page UID as fallback", () => {
    expect(
      buildEventShopStateIdentity({
        timelineUid: "steel-continent-malkuth",
        shopContentUid: "854",
      }),
    ).toEqual({
      shopStateUid: "854",
      fallbackStateUid: "steel-continent-malkuth",
    });
  });
});
