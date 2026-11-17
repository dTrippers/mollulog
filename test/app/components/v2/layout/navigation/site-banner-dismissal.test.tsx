/** @jest-environment jsdom */

import "../layout-test-polyfills";
import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import NavigationBar from "~/components/v2/layout/navigation/NavigationBar";
import { SiteBanner } from "~/components/v2/layout/navigation/SiteBanner";
import type { PreferenceSubmission } from "~/auth/preference.server";
import { useSiteBannerDismissal } from "~/components/v2/layout/navigation/use-site-banner-dismissal";
import type { SiteBanner as SiteBannerData } from "~/domain/site-banner";

const banner: SiteBannerData = {
  uid: "banner-1",
  message: "공지사항을 확인해 주세요.",
  link: "https://mollulog.net/news",
  colorPreset: "blue",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2027-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  screens: ["desktop_navigation", "mobile_header", "futures_top", "community_top"],
};

describe("SiteBanner close button", () => {
  it("dismisses the banner by uid", () => {
    const onDismiss = jest.fn();
    render(<SiteBanner banner={banner} slot="futures_top" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: "배너 닫기" }));

    expect(onDismiss).toHaveBeenCalledWith("banner-1");
  });
});

describe("useSiteBannerDismissal", () => {
  it("hides the banner right away and keeps it hidden once the preference is saved", async () => {
    const submit = jest.fn((_preference: PreferenceSubmission) => Promise.resolve());
    const { result } = renderHook(() => useSiteBannerDismissal(banner, submit));

    await act(async () => {
      result.current.dismissSiteBanner("banner-1");
    });

    expect(submit).toHaveBeenCalledWith({ dismissedSiteBannerUid: "banner-1" });
    expect(result.current.siteBanner).toBeNull();
  });

  it("shows the banner again when saving the dismissal fails", async () => {
    let rejectSubmit: (error: Error) => void = () => undefined;
    const submit = jest.fn(
      (_preference: PreferenceSubmission) =>
        new Promise<void>((_, reject) => {
          rejectSubmit = reject;
        }),
    );
    const { result } = renderHook(() => useSiteBannerDismissal(banner, submit));

    act(() => {
      result.current.dismissSiteBanner("banner-1");
    });
    expect(result.current.siteBanner).toBeNull();

    await act(async () => {
      rejectSubmit(new Error("Preference update failed"));
    });

    expect(result.current.siteBanner).toBe(banner);
  });
});

describe("mobile header banner height", () => {
  beforeAll(() => {
    window.matchMedia = jest.fn(() => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });

  function renderNavigation(siteBanner: SiteBannerData | null) {
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: (
            <NavigationBar
              currentUsername={null}
              isAdmin={false}
              currentProfileStudentId={null}
              favoriteNavigationIds={[]}
              mobileNavigationIds={["feed", "students"]}
              darkMode={false}
              setDarkMode={() => undefined}
              upcomingEvent={null}
              hasRecentNews={false}
              hasOngoingRaid={false}
              hasUnconsumedCoupons={false}
              hasUnreadFeedbackReplies={false}
              unreadNotificationCount={0}
              menuBadgeOverrides={{}}
              siteBanner={siteBanner}
              onDismissSiteBanner={() => undefined}
            />
          ),
        },
      ],
      { initialEntries: ["/news"] },
    );
    return render(<RouterProvider router={router} />);
  }

  it("overrides the server height estimate with zero once the banner is gone", () => {
    const view = renderNavigation(banner);
    expect(screen.getAllByRole("button", { name: "배너 닫기" }).length).toBeGreaterThan(0);

    view.unmount();
    renderNavigation(null);

    expect(document.documentElement.style.getPropertyValue("--mobile-site-banner-measured-height")).toBe("0px");
  });
});
