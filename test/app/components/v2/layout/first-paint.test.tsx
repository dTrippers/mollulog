/**
 * @jest-environment jsdom
 */
import "./layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { PageAside, PageHeader, PageMain, PageToolbar, PanelSheet, ScreenTabs, V2Page } from "~/components/v2/layout";

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
});
