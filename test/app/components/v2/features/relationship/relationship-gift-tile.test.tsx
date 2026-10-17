/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RelationshipGiftTile } from "~/components/v2/features/relationship/RelationshipGiftTile";

function renderTile() {
  render(<RelationshipGiftTile
    gift={{ item: { uid: "5103", name: "선물", rarity: 4 }, exp: 180, favoriteLevel: 3, favorited: true }}
    requiredQuantity={10}
    ownedQuantity={0}
    breakdown={[{ studentUid: "10000", name: "아루", quantity: 10 }]}
  />);
  return screen.getByRole("button", { name: /필요/ });
}

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

describe("RelationshipGiftTile breakdown", () => {
  it("opens only from required quantity and stays open while crossing to the popover", async () => {
    jest.useFakeTimers();
    const trigger = renderTile();
    const owned = screen.getByText("보유").parentElement!;
    expect(trigger.contains(owned)).toBe(false);
    fireEvent.mouseEnter(owned);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.mouseEnter(trigger);
    const panel = await screen.findByRole("dialog", { name: "필요한 학생별 선물 수량" });
    expect(panel.textContent).toContain("아루");
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(panel);
    act(() => jest.advanceTimersByTime(200));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.mouseLeave(panel);
    act(() => jest.advanceTimersByTime(200));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps click-open after hover and closes on Escape with focus returned", async () => {
    jest.useFakeTimers();
    const trigger = renderTile();
    fireEvent.mouseEnter(trigger);
    await screen.findByRole("dialog", { name: "필요한 학생별 선물 수량" });
    fireEvent.click(trigger);
    fireEvent.mouseLeave(trigger);
    act(() => jest.advanceTimersByTime(200));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("false"));
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
