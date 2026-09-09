import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import PagePanel from "~/components/features/layout/PagePanel";

function PanelIcon() {
  return null;
}

describe("PagePanel header actions", () => {
  it("keeps a collapsible header action outside the toggle button", () => {
    const markup = renderToStaticMarkup(
      <PagePanel title="필터 및 정렬" Icon={PanelIcon} collapsible headerAction={<button type="button">초기화</button>}>
        <div>패널 본문</div>
      </PagePanel>,
    );

    const toggleEnd = markup.indexOf("</button>");
    const actionStart = markup.indexOf('<button type="button">초기화</button>');

    expect(markup).toContain('aria-expanded="false"');
    expect(markup.match(/<button/g)?.length).toBe(2);
    expect(toggleEnd).toBeGreaterThan(-1);
    expect(actionStart).toBeGreaterThan(toggleEnd);
    expect(markup.slice(0, toggleEnd)).not.toContain("초기화");
  });
});
