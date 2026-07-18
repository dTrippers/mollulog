import { describe, expect, it } from "@jest/globals";
import { getNavigationSections } from "~/components/features/layout/navigation-menu";

function getRaidMenuItem(hasOngoingRaid: boolean) {
  return getNavigationSections({
    pathname: "/",
    upcomingEvent: null,
    hasOngoingRaid,
    hasUnconsumedCoupons: false,
  })
    .flatMap((section) => section.items)
    .find((item) => item.to === "/raids");
}

describe("getNavigationSections", () => {
  it("labels the raid menu only while a raid is ongoing", () => {
    expect(getRaidMenuItem(true)?.badgeLabel).toBe("진행중");
    expect(getRaidMenuItem(false)?.badgeLabel).toBeUndefined();
  });
});
