import { describe, expect, it } from "@jest/globals";
import { getEventShopDestinationPath, selectEventShopDestination } from "~/domain/event-shop-destination";

const now = "2026-08-18T00:00:00.000Z";

const candidate = (uid: string, since: string, until: string | null) => ({ uid, since, until });

describe("event shop destination", () => {
  it("prefers an ongoing shop event over upcoming events", () => {
    expect(
      selectEventShopDestination(
        [
          candidate("upcoming", "2026-08-19T00:00:00.000Z", "2026-08-20T00:00:00.000Z"),
          candidate("ongoing", "2026-08-17T00:00:00.000Z", "2026-08-19T00:00:00.000Z"),
        ],
        now,
      )?.uid,
    ).toBe("ongoing");
  });

  it("chooses the nearest upcoming event when no event is ongoing", () => {
    expect(
      selectEventShopDestination(
        [
          candidate("later", "2026-08-22T00:00:00.000Z", "2026-08-23T00:00:00.000Z"),
          candidate("nearest", "2026-08-19T00:00:00.000Z", "2026-08-20T00:00:00.000Z"),
        ],
        now,
      )?.uid,
    ).toBe("nearest");
  });

  it("treats an open-ended event as ongoing and returns null without candidates", () => {
    expect(selectEventShopDestination([candidate("open", "2026-08-01T00:00:00.000Z", null)], now)?.uid).toBe("open");
    expect(selectEventShopDestination([], now)).toBeNull();
  });

  it("builds the canonical event shop path", () => {
    expect(getEventShopDestinationPath("event-uid")).toBe("/events/event-uid/shop");
  });
});
