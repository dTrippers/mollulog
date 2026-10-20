/**
 * @jest-environment jsdom
 */
import "./layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import {
  AsideLinks,
  MobileActionBar,
  PageAside,
  PageHeader,
  PageMain,
  PageToolbar,
  PanelSheet,
  ScreenNavigation,
  ScreenNavigationFocusScope,
  ScreenNavigationToolbar,
  ScreenTabs,
  V2Page,
} from "~/components/v2/layout";

function Icon() {
  return null;
}

function Screen() {
  return (
    <V2Page width="wide">
      <PageHeader title="미래시" />
      <PageToolbar>
        <ScreenTabs
          items={[
            { key: "timeline", text: "타임라인", Icon, active: true, link: "/futures" },
            { key: "list", text: "목록", Icon, link: "/futures/list" },
          ]}
        />
      </PageToolbar>
      <PageMain>본문</PageMain>
      <PageAside>
        <PanelSheet panelId="filter" title="컨텐츠 필터" Icon={Icon}>
          <span>이벤트 필터 본문</span>
        </PanelSheet>
      </PageAside>
    </V2Page>
  );
}

function ResponsiveNavigationScreen() {
  const items = [
    { key: "intro", text: "소개", Icon, active: true, link: "/developers" },
    { key: "docs", text: "API 문서", Icon, link: "/developers/docs" },
    { key: "keys", text: "API 키", Icon, link: "/developers/keys" },
  ];
  const history = {
    key: "history",
    title: "데이터 변경 이력",
    description: "API로 변경한 데이터를 확인해요.",
    shortTitle: "변경 이력",
    Icon,
    to: "/data-history?filter=api",
  };

  return (
    <V2Page width="wide">
      <PageHeader title="몰루로그 API" />
        <ScreenNavigationFocusScope>
          <ScreenNavigationToolbar items={items} />
          <PageAside>
            <ScreenNavigation items={items} />
            <AsideLinks items={[history]} />
          </PageAside>
        </ScreenNavigationFocusScope>
      <PageMain>API 화면 본문</PageMain>
      <MobileActionBar links={[history]} />
    </V2Page>
  );
}

describe("first paint structure", () => {
  it("renders the desktop structure before any measurement", () => {
    const markup = renderToStaticMarkup(
      <StaticRouter location="/futures">
        <Screen />
      </StaticRouter>,
    );

    // The Aside panel body is in the first render; CSS hides the Aside on stacked.
    expect(markup).toContain('<aside aria-label="보조 도구"');
    expect(markup).toContain("이벤트 필터 본문");
    expect(markup).not.toContain('role="dialog"');
    // The CSS active-tab bar is on the active item; the measured indicator is not rendered yet.
    expect(markup).toContain("v2-tab-active");
    expect(markup).not.toContain("data-indicator-ready");
    expect(markup).toContain('data-stacked="true"');
  });

  it("server-renders both responsive nav forms with the desktop Aside before Main", () => {
    const markup = renderToStaticMarkup(
      <StaticRouter location="/developers">
        <ResponsiveNavigationScreen />
      </StaticRouter>,
    );

    expect(markup).toContain('data-stacked="true"');
    expect(markup.match(/aria-label="화면 탐색"/g)).toHaveLength(2);
    expect(markup.match(/data-stacked-only="true"/g)).toHaveLength(2);
    const aside = markup.indexOf('<aside aria-label="보조 도구"');
    const main = markup.indexOf('class="v2-main min-w-0"');
    expect(aside).toBeGreaterThan(-1);
    expect(main).toBeGreaterThan(aside);
    expect(markup.indexOf("데이터 변경 이력")).toBeLessThan(main);
  });
});
