/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { PageActionBar } from "~/components/v2/layout/PageActionBar";

describe("PageActionBar", () => {
  it("floats as a translucent inverse capsule and emphasizes the summary over its note", () => {
    const { container } = render(
      <PageActionBar summary="선택한 항목 3개" note="선택하지 않은 항목은 삭제돼요.">
        <button type="button">적용</button>
      </PageActionBar>,
    );
    const bar = container.firstElementChild as HTMLElement;
    const summary = screen.getByText("선택한 항목 3개");
    const note = screen.getByText("선택하지 않은 항목은 삭제돼요.");

    expect(bar.className).toContain("v2-floating-inverse");
    expect(bar.className).toContain("backdrop-blur-md");
    expect(bar.className).toContain("shadow-lg");
    // Grouped by its surface, not by a border.
    expect(bar.className).not.toMatch(/(^|\s)border(\s|-)/);
    // A gap from the bottom edge, and centered at its content width on wide screens.
    expect(bar.className).toContain("sticky bottom-4");
    expect(bar.className).toContain("sm:w-fit");
    expect(summary.className).toContain("font-semibold text-v2-fg");
    expect(note.className).toContain("text-xs");
    expect(note.className).toContain("text-v2-fg-secondary");
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
    // Centered at its content width from sm, like the sticky bar.
    expect(bar.className).toContain("sm:mx-auto sm:w-fit");
    expect(bar.className).toContain("z-30");
  });

  it("gives the actions their own row on mobile when asked", () => {
    render(
      <PageActionBar summary="학생 4명" expandActions>
        <button type="button">취소</button>
        <button type="button">저장</button>
      </PageActionBar>,
    );
    const actions = screen.getByRole("button", { name: "저장" }).parentElement as HTMLElement;

    expect(actions.className).toContain("w-full");
    expect(actions.className).toContain("[&>:last-child]:flex-1");
  });
});
