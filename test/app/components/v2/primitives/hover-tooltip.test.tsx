/** @jest-environment jsdom */
import { afterEach, describe, expect, it } from "@jest/globals";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HoverTooltip } from "~/components/v2/primitives/HoverTooltip";

afterEach(cleanup);

describe("HoverTooltip", () => {
  it("shows a real tooltip on hover and focus, dismisses on Escape/scroll, and can reopen", () => {
    const { container } = render(<HoverTooltip content="고풍스러운 달걀 공예품"><button type="button">선물</button></HoverTooltip>);
    const wrapper = container.firstElementChild!;
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(wrapper);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe("고풍스러운 달걀 공예품");
    expect(wrapper.getAttribute("aria-describedby")).toBe(tooltip.id);
    expect(tooltip.parentElement).toBe(document.body);
    fireEvent.focus(screen.getByRole("button"));
    expect(tooltip.style.visibility).toBe("visible");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseLeave(wrapper);
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole("tooltip").style.visibility).toBe("visible");
    fireEvent.scroll(window);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).not.toBeNull();
    fireEvent.blur(screen.getByRole("button"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
