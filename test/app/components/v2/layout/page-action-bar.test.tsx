/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { PageActionBar } from "~/components/v2/layout/PageActionBar";

describe("PageActionBar", () => {
  it("uses a bordered surface card and emphasizes a single-node summary", () => {
    const { container } = render(
      <PageActionBar summary="선택한 항목 3개">
        <button type="button">적용</button>
      </PageActionBar>,
    );
    const bar = container.firstElementChild as HTMLElement;
    const summary = screen.getByText("선택한 항목 3개");

    expect(bar.className).toContain("bg-v2-surface");
    expect(bar.className).toContain("border-v2-control-border");
    expect(bar.className).toContain("shadow-lg");
    expect(bar.className).toContain("rounded-lg");
    expect(summary.className).toContain("font-semibold text-v2-fg");
  });

  it("keeps fixed bars full-width above mobile navigation with only a top border", () => {
    const { container } = render(
      <PageActionBar placement="fixed" summary="인식 대기">
        <button type="button">시작</button>
      </PageActionBar>,
    );
    const bar = container.firstElementChild as HTMLElement;

    expect(bar.className).toContain("fixed");
    expect(bar.className).toContain("inset-x-0");
    expect(bar.className).toContain("bottom-[var(--mobile-nav-height)]");
    expect(bar.className).toContain("border-t");
    expect(bar.className).toContain("border-x-0");
    expect(bar.className).toContain("border-b-0");
    expect(bar.className).toContain("z-30");
    expect(bar.className).not.toContain("rounded-lg");
  });
});
