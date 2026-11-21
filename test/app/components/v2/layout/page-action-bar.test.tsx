/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { PageActionBar } from "~/components/v2/layout/PageActionBar";

describe("PageActionBar", () => {
  it("floats as a translucent tinted card and emphasizes a single-node summary", () => {
    const { container } = render(
      <PageActionBar summary="선택한 항목 3개">
        <button type="button">적용</button>
      </PageActionBar>,
    );
    const bar = container.firstElementChild as HTMLElement;
    const summary = screen.getByText("선택한 항목 3개");

    expect(bar.className).toContain("bg-v2-page-action-bar");
    expect(bar.className).toContain("backdrop-blur-md");
    expect(bar.className).toContain("border-v2-control-border");
    expect(bar.className).toContain("shadow-lg");
    expect(bar.className).toContain("rounded-lg");
    // A gap from the bottom edge, not flush with it.
    expect(bar.className).toContain("sticky bottom-4");
    expect(summary.className).toContain("font-semibold text-v2-fg");
  });

  it("keeps a fixed bar inset from the screen edges above mobile navigation", () => {
    const { container } = render(
      <PageActionBar placement="fixed" summary="인식 대기">
        <button type="button">시작</button>
      </PageActionBar>,
    );
    const bar = container.firstElementChild as HTMLElement;

    expect(bar.className).toContain("fixed");
    expect(bar.className).toContain("inset-x-3");
    expect(bar.className).toContain("bottom-[calc(var(--mobile-nav-height)+0.75rem)]");
    expect(bar.className).toContain("rounded-lg");
    expect(bar.className).toContain("border");
    expect(bar.className).toContain("z-30");
  });
});
