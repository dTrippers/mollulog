import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useLoaderData: jest.fn(),
    useOutletContext: jest.fn(),
    useSubmit: jest.fn(),
    useRevalidator: jest.fn(() => ({ revalidate: jest.fn(), state: "idle" })),
  };
});
jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/views/more", () => ({ getMoreViewData: jest.fn() }));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useLoaderData, useOutletContext, useSubmit } from "react-router";
import type { NavigationBarContents } from "~/views/navigation";
import type { MoreAccount, MoreSummary } from "~/views/more";
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

const account: MoreAccount = { username: "sensei", profileStudentId: null };

function createSummary(): MoreSummary {
  return {
    recruitedStudentCount: 1,
    pickupHistoryCount: 2,
    availableCouponCount: 0,
    pyroxene: null,
    relationship: { savedCount: 0, targetStudentCount: 0, targetStudents: [] },
  };
}

function renderMore(
  data: { account: MoreAccount | null; summary: MoreSummary | null },
  contents: Partial<NavigationBarContents> = {},
): string {
  mockUseLoaderData.mockReturnValue(data);
  mockUseOutletContext.mockReturnValue({
    currentUsername: data.account?.username ?? null,
    isAdmin: false,
    darkMode: false,
    setDarkMode: jest.fn(),
    mobileNavigationIds: ["feed", "students"],
    setMobileNavigationIds: jest.fn(),
    navigationBarContents: { ...navigationBarContents, ...contents },
  });
  mockUseSubmit.mockReturnValue(jest.fn());

  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(MoreIndexPage)));
}

// The first link whose opening tag has every given attribute fragment, in any order. It fails the test when none does,
// so a negative assertion on its content cannot pass on an empty match.
function findLink(markup: string, ...fragments: string[]): string {
  const link = [...markup.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)]
    .map(([match]) => match)
    .find((match) => {
      const openingTag = match.slice(0, match.indexOf(">") + 1);
      return fragments.every((fragment) => openingTag.includes(fragment));
    });
  if (!link) throw new Error(`No link with ${fragments.join(" ")}`);
  return link;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("MoreIndexPage SSR rendering", () => {
  it("puts the coupon account dot on the coupon tile and not on the coupon menu", () => {
    const markup = renderMore({ account, summary: { ...createSummary(), availableCouponCount: 3 } });
    const couponTile = findLink(markup, 'href="/coupons"', 'class="flex min-w-0 flex-col');
    const couponMenu = findLink(markup, 'href="/coupons"', 'title="쿠폰"');

    expect(couponTile).toContain("쿠폰");
    expect(couponTile).toContain("개 사용 가능");
    expect(couponTile).toContain('data-navigation-dot="account"');
    expect(couponTile).toContain('<span class="sr-only">, 확인할 내 정보 있음</span>');
    expect(couponMenu).not.toContain("data-navigation-dot");
  });

  it.each([
    { account: null, summary: null },
    { account, summary: createSummary() },
  ])("renders the /more page without throwing for %o", (data) => {
    const markup = renderMore(data);

    expect(markup).toContain("모든 메뉴");
    expect(markup).toContain("게임 정보");
    expect(markup).toContain('id="mobile-navigation-settings"');
    expect(markup.indexOf("플래너·계산기")).toBeLessThan(markup.indexOf("게임 정보"));
    if (data.account) {
      expect(markup).toContain("모집한 학생");
      expect(markup).toContain("공략 작성하기");
      expect(markup).toContain('href="/@sensei"');
      expect(markup).toContain('href="/signout"');
      expect(markup.indexOf("커뮤니티")).toBeLessThan(markup.indexOf("나의 데이터"));
    } else {
      expect(markup).toContain("로그인 후 이용해 보세요");
      expect(markup).not.toContain('href="/signout"');
      expect(markup).not.toContain("내 계획");
    }
  });

  it("shows a failure in the account block, without zeros, when the summary fails", () => {
    const markup = renderMore({ account, summary: null });

    expect(markup).toContain("@sensei");
    expect(markup).toContain("내 정보를 불러오지 못했어요.");
    expect(markup).toContain("다시 시도");
    expect(findLink(markup, 'href="/@sensei/students"', 'class="flex min-w-0 flex-col')).not.toMatch(/명|>0</);
    expect(findLink(markup, 'href="/@sensei/pickups"', 'class="flex min-w-0 flex-col')).not.toMatch(/건|>0</);
    expect(markup).toContain("모든 메뉴");
    expect(markup).toContain('id="mobile-navigation-settings"');
  });

  it("keeps the coupon dot from the navigation state when the summary fails", () => {
    const markup = renderMore({ account, summary: null }, { hasUnconsumedCoupons: true });

    expect(findLink(markup, 'href="/coupons"', 'class="flex min-w-0 flex-col')).toContain('data-navigation-dot="account"');
  });

  it("renders a target-only relationship student without a current-rank badge", () => {
    const summary = createSummary();
    summary.relationship = {
      savedCount: 1,
      targetStudentCount: 1,
      targetStudents: [{ uid: "student-target-only", name: "무츠키(드레스)", currentLevel: null }],
    };

    const markup = renderMore({ account, summary });

    expect(markup).toContain('href="/utils/relationship?studentUid=student-target-only"');
    expect(markup).toContain('aria-label="무츠키(드레스)"');
    expect(markup).toContain("1명의 학생 관리 중");
    expect(markup).not.toContain("현재 인연 랭크");
  });

  it.each([
    [null, "현재 보유 재화를 입력해 주세요"],
    [{ nextStudents: [] }, "관심 학생 모집 일정이 없어요"],
    [{ nextStudents: [{ uid: "s", name: "학생" }], expectedPyroxene: null }, "계산할 수 없어요"],
    [{ nextStudents: [{ uid: "s", name: "학생" }], expectedPyroxene: 24800, expectedTicketTrialCount: 10 }, "24,800"],
    [{ nextStudents: [{ uid: "s", name: "학생" }], nextTimelineLabel: "진행중" }, "진행중"],
  ])("shows the upcoming recruitment state %o", (pyroxene, text) => {
    const summary = createSummary();
    summary.pyroxene = pyroxene
      ? {
          pyroxene: 12340,
          oneTimeTicket: 0,
          tenTimeTicket: 2,
          favoritedRecruitmentCount: pyroxene.nextStudents.length,
          nextTimelineLabel: null,
          expectedPyroxene: null,
          expectedTicketTrialCount: null,
          ...pyroxene,
        }
      : null;

    expect(renderMore({ account, summary })).toContain(text);
  });

  it("keeps a menu's label and dot in its accessible name while the label is hidden on mobile", () => {
    const markup = renderMore({ account, summary: createSummary() }, { hasOngoingRaid: true, hasRecentNews: true });

    expect(findLink(markup, 'href="/raids"')).toContain('aria-label="총력전 / 대결전, 진행중"');
    expect(findLink(markup, 'href="/news"')).toContain('aria-label="업데이트 소식, 새 소식 있음"');
  });
});
