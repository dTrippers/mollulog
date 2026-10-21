/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShopSection } from "~/components/v2/features/events/ShopSection";

describe("ShopSection persistence", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the 1.x panel key and stores JSON booleans", async () => {
    render(<ShopSection title="상점 아이템" variant="shop" persistenceKey="event-shop-section::shop-resource-selector">내용</ShopSection>);
    const key = "panel::event-shop-section::shop-resource-selector";
    const titleButton = screen.getByRole("button", { name: "상점 아이템" });

    expect(titleButton.className.split(/\s+/)).toContain("h-7");
    expect(titleButton.className.split(/\s+/)).not.toContain("min-h-v2-row-min");

    await waitFor(() => expect(localStorage.getItem(key)).toBe("true"));
    fireEvent.click(titleButton);

    await waitFor(() => expect(localStorage.getItem(key)).toBe("false"));
  });

  it("keeps the existing boxed presentation and key for non-shop sections", () => {
    const { container } = render(<ShopSection title="카드 뒤집기" persistenceKey="event-shop-section::card-flip-strategy">내용</ShopSection>);

    expect(container.querySelector("section")?.className).toContain("bg-v2-surface");
    expect(container.querySelector("section")?.className).toContain("p-v2-block-p");
  });

  it("allows an existing key to stay unchanged when a section adopts the shop variant", async () => {
    const key = "event-treasure-hunt-section::round-details";
    localStorage.setItem(key, "false");
    render(
      <ShopSection
        title="회차별 보물 및 보상"
        variant="shop"
        persistenceKey={key}
        storageKey={key}
      >
        내용
      </ShopSection>,
    );

    const title = screen.getByRole("button", { name: "회차별 보물 및 보상" });
    await waitFor(() => expect(title.getAttribute("aria-expanded")).toBe("false"));
    fireEvent.click(title);

    await waitFor(() => expect(localStorage.getItem(key)).toBe("true"));
    expect(localStorage.getItem(`panel::${key}`)).toBeNull();
  });
});
