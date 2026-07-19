import { describe, expect, it } from "@jest/globals";
import { getNavigationSections } from "~/components/features/layout/navigation-menu";

function getMenuItems({ hasOngoingRaid = false, isSignedIn = false } = {}) {
  return getNavigationSections({
    pathname: "/",
    upcomingEvent: null,
    hasOngoingRaid,
    hasUnconsumedCoupons: false,
    isSignedIn,
  }).flatMap((section) => section.items);
}

describe("getNavigationSections", () => {
  it("labels the raid menu only while a raid is ongoing", () => {
    expect(getMenuItems({ hasOngoingRaid: true }).find((item) => item.to === "/raids")?.badgeLabel).toBe("진행중");
    expect(getMenuItems().find((item) => item.to === "/raids")?.badgeLabel).toBeUndefined();
  });

  it("labels guest access to the pyroxene planner only while signed out", () => {
    expect(getMenuItems().find((item) => item.to === "/utils/pyroxene")?.badgeLabel).toBe("로그인 없이 사용");
    expect(
      getMenuItems({ isSignedIn: true }).find((item) => item.to === "/utils/pyroxene")?.badgeLabel,
    ).toBeUndefined();
  });
});
