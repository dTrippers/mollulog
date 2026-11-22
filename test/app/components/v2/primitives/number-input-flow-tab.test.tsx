/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useNumberInputFlowNavigation } from "~/components/v2/primitives/use-number-input-flow-navigation";

function Grid({ tabMovesBetweenInputs }: { tabMovesBetweenInputs: boolean }) {
  const { getInputProps } = useNumberInputFlowNavigation({ tabMovesBetweenInputs });
  return (
    <div>
      <input aria-label="A" {...getInputProps()} />
      <button type="button">step</button>
      <input aria-label="B" disabled {...getInputProps()} />
      <input aria-label="C" data-hidden="true" {...getInputProps()} />
      <input aria-label="D" {...getInputProps()} />
    </div>
  );
}

describe("number input flow Tab option", () => {
  beforeEach(() => {
    // jsdom has no layout; an element marked hidden has no boxes, as with display: none.
    jest.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
      return (this.dataset.hidden === "true" ? [] : [{}]) as unknown as DOMRectList;
    });
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  it("moves Tab and Shift+Tab to the next and previous enabled, visible input", () => {
    render(<Grid tabMovesBetweenInputs />);
    const a = screen.getByLabelText("A");
    const d = screen.getByLabelText("D");

    a.focus();
    expect(fireEvent.keyDown(a, { key: "Tab" })).toBe(false);
    expect(document.activeElement).toBe(d);

    expect(fireEvent.keyDown(d, { key: "Tab", shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(a);
  });

  it("leaves Tab to the browser past either end of the flow", () => {
    render(<Grid tabMovesBetweenInputs />);
    const a = screen.getByLabelText("A");
    const d = screen.getByLabelText("D");

    expect(fireEvent.keyDown(d, { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(a, { key: "Tab", shiftKey: true })).toBe(true);
  });

  it("leaves Tab to the browser without the option", () => {
    render(<Grid tabMovesBetweenInputs={false} />);
    expect(fireEvent.keyDown(screen.getByLabelText("A"), { key: "Tab" })).toBe(true);
  });
});
