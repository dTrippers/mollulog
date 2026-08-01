import { describe, expect, it } from "@jest/globals";
import {
  getAvailableNavigationFavorites,
  MAX_NAVIGATION_FAVORITE_IDS,
  normalizeNavigationFavoriteIds,
  toggleNavigationFavoriteId,
} from "~/domain/navigation-favorites";

describe("navigation favorites", () => {
  it("normalizes, deduplicates, and bounds persisted IDs without changing their order", () => {
    const values = [" events ", "events", "profile", null, 42, "", ...Array.from({ length: 40 }, (_, i) => `id-${i}`)];

    expect(normalizeNavigationFavoriteIds(values)).toEqual([
      "events",
      "profile",
      ...Array.from({ length: MAX_NAVIGATION_FAVORITE_IDS - 2 }, (_, i) => `id-${i}`),
    ]);
  });

  it("appends favorites and removes them without reordering the remaining IDs", () => {
    expect(toggleNavigationFavoriteId(["events", "profile"], "contact")).toEqual(["events", "profile", "contact"]);
    expect(toggleNavigationFavoriteId(["events", "profile", "contact"], "profile")).toEqual(["events", "contact"]);
    expect(toggleNavigationFavoriteId(["events", "profile"], "events")).toEqual(["profile"]);
  });

  it("filters unavailable and disabled rows while preserving stored registration order", () => {
    const items = [
      { favoriteId: "profile", name: "내 프로필" },
      { favoriteId: "event-shop", name: "이벤트 소탕 계산기", disabled: true },
      { favoriteId: "contact", name: "제안/문의" },
    ];

    expect(getAvailableNavigationFavorites(["contact", "event-shop", "missing", "profile"], items)).toEqual([
      items[2],
      items[0],
    ]);
  });
});
