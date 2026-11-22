/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { SectionTabs } from "~/components/v2/primitives/SectionTabs";

describe("SectionTabs", () => {
  it("keeps in-section tabs pressed and changes the selected id without screen navigation", () => {
    const onChange = jest.fn<(id: string) => void>();
    const { container } = render(
      <SectionTabs
        label="결제 재화"
        selectedId="coin-a"
        onChange={onChange}
        items={[
          { id: "coin-a", label: "감사계획서", imageUrl: "/coin-a.png" },
          { id: "coin-b", label: "시설 입장권" },
        ]}
      />,
    );

    const tabs = screen.getByRole("group", { name: "결제 재화" });
    expect(tabs).toBeTruthy();
    expect(tabs.className.split(/\s+/)).toContain("my-2");
    expect(screen.getByRole("button", { name: "감사계획서" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "시설 입장권" }).getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector('img[src="/coin-a.png"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "시설 입장권" }));

    expect(onChange).toHaveBeenCalledWith("coin-b");
  });
});
