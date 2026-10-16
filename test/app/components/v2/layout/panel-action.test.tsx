/**
 * @jest-environment jsdom
 */
import "./layout-test-polyfills";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { PanelAction } from "~/components/v2/layout";

describe("PanelAction", () => {
  it("renders a type=button with its verb label and the neutral look by default", () => {
    render(<PanelAction onClick={() => {}}>모두 보기</PanelAction>);

    const button = screen.getByRole("button", { name: "모두 보기" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.classList.contains("text-v2-fg-secondary")).toBe(true);
    expect(button.classList.contains("bg-v2-danger-subtle")).toBe(false);
    expect(button.classList.contains("text-v2-danger")).toBe(false);
    expect(button.classList.contains("h-7")).toBe(true);
    expect(button.classList.contains("text-xs")).toBe(true);
  });

  it("uses the danger-subtle background and danger text for the danger variant", () => {
    render(
      <PanelAction variant="danger" onClick={() => {}}>
        초기화
      </PanelAction>,
    );

    const button = screen.getByRole("button", { name: "초기화" });
    expect(button.classList.contains("bg-v2-danger-subtle")).toBe(true);
    expect(button.classList.contains("text-v2-danger")).toBe(true);
    expect(button.classList.contains("text-v2-fg-secondary")).toBe(false);
    expect(button.classList.contains("text-xs")).toBe(true);
  });

  it("calls onClick once when pressed", () => {
    const onClick = jest.fn();
    render(
      <PanelAction variant="danger" onClick={onClick}>
        초기화
      </PanelAction>,
    );

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled, does not call onClick, and styles the disabled state with tokens", () => {
    const onClick = jest.fn();
    render(
      <PanelAction variant="danger" onClick={onClick} disabled>
        초기화
      </PanelAction>,
    );

    const button = screen.getByRole("button", { name: "초기화" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
    expect(button.classList.contains("disabled:bg-transparent")).toBe(true);
    expect(button.classList.contains("disabled:text-v2-fg-disabled")).toBe(true);
    expect(button.classList.contains("disabled:cursor-not-allowed")).toBe(true);
  });

  it("grows the touch hit area on coarse pointers only", () => {
    render(<PanelAction onClick={() => {}}>모두 보기</PanelAction>);

    const button = screen.getByRole("button", { name: "모두 보기" });
    expect(button.classList.contains("pointer-coarse:before:-inset-y-2")).toBe(true);
    expect(button.classList.contains("h-7")).toBe(true);
  });
});
