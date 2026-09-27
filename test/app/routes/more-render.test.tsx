import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useLoaderData: jest.fn(),
    useOutletContext: jest.fn(),
    useSubmit: jest.fn(),
  };
});
jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/views/more", () => ({ getMoreViewData: jest.fn() }));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useLoaderData, useOutletContext, useSubmit } from "react-router";
import type { NavigationBarContents } from "~/views/navigation";
import type { MoreCurrentUser } from "~/views/more";
import MoreIndexPage from "~/routes/more._index";

const mockUseLoaderData = useLoaderData as unknown as jest.Mock;
const mockUseOutletContext = useOutletContext as unknown as jest.Mock;
const mockUseSubmit = useSubmit as unknown as jest.Mock;

const navigationBarContents: NavigationBarContents = {
  upcomingEvent: null,
  hasRecentNews: false,
  hasOngoingRaid: false,
  hasActiveCoupons: false,
  hasUnconsumedCoupons: false,
  hasUnreadFeedbackReplies: false,
  unreadNotificationCount: 0,
  menuBadgeOverrides: {},
};

function createCurrentUser(): MoreCurrentUser {
  return {
    username: "sensei",
    profileStudentId: null,
    recruitedStudentCount: 1,
    pickupHistoryCount: 2,
    availableCouponCount: 0,
    pyroxene: null,
    relationship: { savedCount: 0, targetStudentCount: 0, targetStudents: [] },
  };
}

function renderMore(currentUser: MoreCurrentUser | null): string {
  mockUseLoaderData.mockReturnValue({ currentUser });
  mockUseOutletContext.mockReturnValue({
    currentUsername: currentUser?.username ?? null,
    darkMode: false,
    setDarkMode: jest.fn(),
    mobileNavigationIds: ["feed", "students"],
    setMobileNavigationIds: jest.fn(),
    navigationBarContents,
  });
  mockUseSubmit.mockReturnValue(jest.fn());

  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(MoreIndexPage)),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("MoreIndexPage SSR rendering", () => {
  it.each([null, createCurrentUser()])("renders the /more page without throwing for %s", (currentUser) => {
    const markup = renderMore(currentUser);

    expect(markup).toContain("모든 메뉴");
    expect(markup).toContain("게임 정보");
    if (currentUser) {
      expect(markup).toContain("모집한 학생");
      expect(markup).toContain("공략 작성하기");
      expect(markup).toContain('href="/@sensei"');
      expect(markup.indexOf("커뮤니티")).toBeLessThan(markup.indexOf("나의 데이터"));
    }
  });
});
