/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { SaveToast } from "~/components/v2/primitives/SaveToast";

describe("SaveToast", () => {
  it("renders nothing when idle", () => {
    const { container } = render(<SaveToast saving={false} saved={false} failed={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows saving status while saving, taking priority over saved and failed", () => {
    render(<SaveToast saving saved failed />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("저장 중...");
  });

  it("shows saved status when saved is true and not saving or failed", () => {
    render(<SaveToast saving={false} saved failed={false} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("저장됨");
  });

  it("shows failure alert with retry and dismiss, and re-surfaces on a subsequent save failure", () => {
    const onRetry = jest.fn();
    const { rerender } = render(<SaveToast saving={false} saved={false} failed onRetry={onRetry} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("저장하지 못했어요");

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("alert")).toBeNull();

    // Another save starts and fails again: dismissal must reset.
    rerender(<SaveToast saving saved={false} failed onRetry={onRetry} />);
    expect(screen.getByRole("status").textContent).toContain("저장 중...");

    rerender(<SaveToast saving={false} saved={false} failed onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("저장하지 못했어요");
  });
});
