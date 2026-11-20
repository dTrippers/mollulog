/** @jest-environment jsdom */
import "../layout/layout-test-polyfills";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "@jest/globals";
import { TooltipButton } from "~/components/v2/primitives/TooltipButton";

const pointer = (type: string) => ({ pointerType: type });

function renderButton() {
  render(
    <>
      <TooltipButton label="대전격투 게임기 이름 표시" tooltip="대전격투 게임기">
        <span>icon</span>
      </TooltipButton>
      <p>outside</p>
    </>,
  );
  return screen.getByRole("button", { name: "대전격투 게임기 이름 표시" });
}

describe("TooltipButton", () => {
  beforeAll(() => {
    // jsdom has no PointerEvent, and the button reads its pointer type.
    class TestPointerEvent extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "";
      }
    }
    window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
  });

  it("has no title and describes itself with the tooltip only while open", () => {
    const button = renderButton();

    expect(button.hasAttribute("title")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.pointerEnter(button, pointer("mouse"));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe("대전격투 게임기");
    expect(button.getAttribute("aria-describedby")).toBe(tooltip.id);
    // The tooltip renders on the body, outside any clipping block.
    expect(tooltip.parentElement).toBe(document.body);
  });

  it("opens on hover, stays open on a mouse click, and closes when the pointer leaves", () => {
    const button = renderButton();

    fireEvent.pointerEnter(button, pointer("mouse"));
    expect(button.getAttribute("aria-expanded")).toBe("true");

    fireEvent.pointerDown(button, pointer("mouse"));
    fireEvent.click(button, { detail: 1 });
    expect(button.getAttribute("aria-expanded")).toBe("true");

    fireEvent.pointerLeave(button, pointer("mouse"));
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles on tap and ignores touch hover", () => {
    const button = renderButton();

    fireEvent.pointerEnter(button, pointer("touch"));
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.pointerDown(button, pointer("touch"));
    fireEvent.click(button, { detail: 1 });
    expect(button.getAttribute("aria-expanded")).toBe("true");

    fireEvent.pointerDown(button, pointer("touch"));
    fireEvent.click(button, { detail: 1 });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on an outside press, Escape, and blur", () => {
    const button = renderButton();

    fireEvent.pointerDown(button, pointer("touch"));
    fireEvent.click(button, { detail: 1 });
    fireEvent.pointerDown(screen.getByText("outside"), pointer("touch"));
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button, { detail: 0 });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button, { detail: 0 });
    fireEvent.blur(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});
