import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteBanner, type SiteBannerSlot } from "~/components/v2/layout/navigation/SiteBanner";
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

const noop = () => undefined;

describe("SiteBanner slot typography", () => {
  it("uses compact text only in the desktop navigation slot", () => {
    const desktop = renderToStaticMarkup(<SiteBanner banner={banner} slot="desktop_navigation" onDismiss={noop} />);

    expect(desktop).toContain("text-xs leading-4");
    expect(desktop).not.toContain("text-sm");
  });

  it.each(["mobile_header", "futures_top", "community_top"] satisfies SiteBannerSlot[])(
    "keeps the standard text size in the %s slot",
    (slot) => {
      const markup = renderToStaticMarkup(<SiteBanner banner={banner} slot={slot} onDismiss={noop} />);

      expect(markup).toContain("text-sm leading-5");
      expect(markup).not.toContain("text-xs");
    },
  );
});

describe("SiteBanner close button", () => {
  it.each(["desktop_navigation", "mobile_header", "futures_top", "community_top"] satisfies SiteBannerSlot[])(
    "renders a close button beside the link in the %s slot",
    (slot) => {
      const markup = renderToStaticMarkup(<SiteBanner banner={banner} slot={slot} onDismiss={noop} />);

      expect(markup).toContain('aria-label="배너 닫기"');
      // The button must stay outside the link so closing never follows it.
      expect(markup).toMatch(/<\/a><button/);
    },
  );
});
