/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { EllipsisHorizontalIcon } from "@heroicons/react/16/solid";
import { fireEvent, render, screen } from "@testing-library/react";
import { ActionMenu, type ActionMenuItem } from "~/components/v2/primitives/ActionMenu";

const items: ActionMenuItem[] = [
  { key: "edit", label: "수정", icon: EllipsisHorizontalIcon, onSelect: jest.fn<() => void>() },
  { key: "delete", label: "삭제", icon: EllipsisHorizontalIcon, danger: true, onSelect: jest.fn<() => void>() },
];

describe("ActionMenu while disabled", () => {
  it("disables the trigger and closes an open menu, so a save in flight cannot start another action", () => {
    const { rerender } = render(<ActionMenu label="의견 메뉴" icon={EllipsisHorizontalIcon} items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "의견 메뉴" }));
    expect(screen.getByRole("menu")).toBeTruthy();

    rerender(<ActionMenu label="의견 메뉴" icon={EllipsisHorizontalIcon} items={items} disabled />);

    expect(screen.queryByRole("menu")).toBeNull();
    expect((screen.getByRole("button", { name: "의견 메뉴" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables every item while disabled", () => {
    render(<ActionMenu label="의견 메뉴" icon={EllipsisHorizontalIcon} items={items} disabled />);

    for (const item of screen.queryAllByRole("menuitem")) {
      expect((item as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
