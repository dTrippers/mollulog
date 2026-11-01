/** @jest-environment jsdom */
import "../layout/layout-test-polyfills";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { HintChip } from "~/components/v2/primitives/HintChip";

const pointer = (type: string) => ({ pointerType: type });

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

function renderChip() {
  render(<HintChip label="이월 불가" description="상세 문구" />);
  return screen.getByRole("button");
}

describe("HintChip", () => {
  beforeAll(() => {
    // jsdom has no PointerEvent, and the chip reads its pointer type.
    class TestPointerEvent extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "";
      }
    }
    window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
  });
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("opens on hover and stays open while the pointer rests on the panel", () => {
    const chip = renderChip();
    fireEvent.pointerEnter(chip, pointer("mouse"));
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    advance(125);
    expect(chip.getAttribute("aria-expanded")).toBe("true");

    fireEvent.pointerLeave(chip, pointer("mouse"));
    fireEvent.pointerEnter(screen.getByRole("dialog"), pointer("mouse"));
    advance(500);
    expect(chip.getAttribute("aria-expanded")).toBe("true");

    fireEvent.pointerLeave(screen.getByRole("dialog"), pointer("mouse"));
    advance(175);
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles on tap", () => {
    const chip = renderChip();
    fireEvent.pointerEnter(chip, pointer("touch"));
    advance(500);
    expect(chip.getAttribute("aria-expanded")).toBe("false");

    fireEvent.pointerDown(chip, pointer("touch"));
    fireEvent.click(chip, { detail: 1 });
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerDown(chip, pointer("touch"));
    fireEvent.click(chip, { detail: 1 });
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles with a keyboard click and closes on Escape", () => {
    const chip = renderChip();
    fireEvent.click(chip, { detail: 0 });
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });

  it("does not reopen when Escape returns focus to a hovered trigger", () => {
    const chip = renderChip();
    fireEvent.pointerEnter(chip, pointer("mouse"));
    advance(125);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });

  it("gives the detail to a screen reader while closed", () => {
    expect(renderChip().textContent).toContain("상세 문구");
  });
});
