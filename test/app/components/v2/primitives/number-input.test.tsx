/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { NumberInput } from "~/components/v2/primitives/NumberInput";

describe("NumberInput grouped stepper", () => {
  it("keeps the stepper in one named control and clamps its actions", () => {
    const onValueChange = jest.fn<(value: number) => void>();
    const { container } = render(
      <NumberInput grouped aria-label="수량" value={4} min={0} max={5} onValueChange={onValueChange} />,
    );

    const group = screen.getByRole("group", { name: "수량" });
    expect(group).toBeTruthy();
    expect(group.className.split(/\s+/)).toContain("h-[26px]");
    expect(group.className.split(/\s+/)).toContain("items-stretch");
    expect(group.className.split(/\s+/)).not.toContain("overflow-hidden");
    expect(group.className).toContain("border-v2-control-border-strong");
    expect(group.className).toContain("dark:border-v2-control-border");
    expect(container.querySelector("input")?.className).toContain("appearance-none");
    expect(container.querySelector("input")?.className).toContain("h-full");
    expect(container.querySelector("input")?.className).toContain("flex-1");
    expect(container.querySelector("input")?.className).toContain("min-w-0");
    expect(container.querySelector("input")?.className).toContain("px-0");
    expect(screen.getByRole("spinbutton", { name: "수량" }).getAttribute("inputmode")).toBe("numeric");
    expect(screen.getByRole("button", { name: "수량 최대" })).toBeTruthy();
    for (const shortcut of ["수량 최소", "수량 최대"]) {
      const button = screen.getByRole("button", { name: shortcut });
      expect(button.className).toContain("px-1");
      expect(button.className).toContain("before:inset-y-");
    }
    for (const step of ["수량 감소", "수량 증가"]) {
      expect(screen.getByRole("button", { name: step }).className).toContain("min-w-4");
    }
    expect([...container.querySelectorAll("button")].every((button) => button.className.includes("h-full"))).toBe(true);
    expect(
      [...container.querySelectorAll("button")].every(
        (button) => button.className.includes("shrink-0") && button.className.includes("whitespace-nowrap"),
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "수량 증가" }));
    fireEvent.click(screen.getByRole("button", { name: "수량 증가" }));
    fireEvent.click(screen.getByRole("button", { name: "수량 최소" }));

    expect(onValueChange.mock.calls.map(([value]) => value)).toEqual([5, 5, 0]);
  });

  it("lets the caller omit endpoint buttons for an unbounded count", () => {
    const onValueChange = jest.fn<(value: number) => void>();
    render(
      <NumberInput
        grouped
        aria-label="소탕 횟수"
        value={0}
        min={0}
        showMin={false}
        showMax={false}
        onValueChange={onValueChange}
      />,
    );

    expect(screen.queryByRole("button", { name: "소탕 횟수 최소" })).toBeNull();
    expect(screen.queryByRole("button", { name: "소탕 횟수 최대" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "소탕 횟수 증가" }));
    expect(onValueChange).toHaveBeenCalledWith(1);
  });

  it("normalizes leading zeros when the value is controlled by a number", () => {
    let value = 0;
    const onValueChange = jest.fn((next: number) => {
      value = next;
    });
    const view = render(
      <NumberInput grouped aria-label="뒤집을 카드 수" value={value} min={0} onValueChange={onValueChange} />,
    );
    const input = screen.getByRole("spinbutton", { name: "뒤집을 카드 수" }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "020" } });
    view.rerender(<NumberInput grouped aria-label="뒤집을 카드 수" value={value} min={0} onValueChange={onValueChange} />);

    expect(onValueChange).toHaveBeenCalledWith(20);
    expect(input.value).toBe("20");
  });

  it("formats large values for display and keeps an ungrouped draft while editing", () => {
    const onValueChange = jest.fn<(value: number) => void>();
    const view = render(
      <NumberInput grouped formatThousands aria-label="목표 스코어" value={1_750_000} min={0} onValueChange={onValueChange} />,
    );
    const input = screen.getByRole("spinbutton", { name: "목표 스코어" }) as HTMLInputElement;

    expect(input.value).toBe("1,750,000");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "2000000" } });
    expect(onValueChange).toHaveBeenCalledWith(2_000_000);
    expect(input.value).toBe("2000000");

    view.rerender(
      <NumberInput grouped formatThousands aria-label="목표 스코어" value={2_000_000} min={0} onValueChange={onValueChange} />,
    );
    fireEvent.blur(input);
    expect(input.value).toBe("2,000,000");
  });

  it("restores select-all after keyboard focus reformats a grouped score input", () => {
    render(
      <NumberInput grouped formatThousands aria-label="목표 스코어" value={2_500_000} min={0} onValueChange={() => undefined} />,
    );
    const input = screen.getByRole("spinbutton", { name: "목표 스코어" }) as HTMLInputElement;
    jest.spyOn(input, "matches").mockReturnValue(true);
    const select = jest.spyOn(input, "select");

    fireEvent.focus(input);

    expect(select).toHaveBeenCalledTimes(1);
  });

  it("preserves click-to-place cursor focus in a grouped score input", () => {
    render(
      <NumberInput grouped formatThousands aria-label="목표 스코어" value={2_500_000} min={0} onValueChange={() => undefined} />,
    );
    const input = screen.getByRole("spinbutton", { name: "목표 스코어" }) as HTMLInputElement;
    jest.spyOn(input, "matches").mockReturnValue(false);
    const select = jest.spyOn(input, "select");

    fireEvent.focus(input);

    expect(select).not.toHaveBeenCalled();
  });

  it("keeps an empty formatted value blank instead of showing zero", () => {
    render(
      <NumberInput grouped formatThousands aria-label="1회 평균 스코어" value="" min={0} onValueChange={() => undefined} />,
    );
    const input = screen.getByRole("spinbutton", { name: "1회 평균 스코어" }) as HTMLInputElement;

    expect(input.value).toBe("");
    expect(input.getAttribute("aria-valuenow")).toBeNull();
  });

  it("keeps ungrouped inputs on their existing input height", () => {
    const { container } = render(<NumberInput aria-label="필요 수량" value={4} readOnly />);
    const input = container.querySelector("input");

    expect(input?.className.split(/\s+/)).toContain("min-h-v2-input-min");
    expect(input?.className.split(/\s+/)).not.toContain("h-[26px]");
  });
});
