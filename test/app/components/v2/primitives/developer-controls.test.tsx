/**
 * @jest-environment jsdom
 */
import "../layout/layout-test-polyfills";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Link, MemoryRouter } from "react-router";
import { type CopyStatus, CopyStatusMessage, CopyTextButton } from "~/components/v2/features/developers/CopyTextButton";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { Checkbox } from "~/components/v2/primitives/Checkbox";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";

let clipboardDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
});

afterEach(() => {
  if (clipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
  jest.useRealTimers();
});

function CopyDocumentationControl() {
  const [status, setStatus] = useState<CopyStatus>("idle");
  return (
    <>
      <CopyTextButton value="https://docs.example.test/reference" onStatusChange={setStatus} />
      <CopyStatusMessage status={status} />
    </>
  );
}

describe("v2 developer controls", () => {
  it("keeps semantic links on the same shared Button styles", () => {
    render(
      <MemoryRouter>
        <Button>Button</Button>
        <Link to="/developers/docs" className={v2ButtonClassName({ variant: "secondary" })}>
          Link
        </Link>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Link" }).className).toBe(
      screen.getByRole("button", { name: "Button" }).className,
    );
  });

  it("forwards native form and ARIA attributes to the checkbox input", () => {
    const onCheckedChange = jest.fn<(checked: boolean) => void>();
    const { container } = render(
      <form>
        <Checkbox
          id="write-scope"
          name="writeScope"
          value="true"
          required
          checked
          onCheckedChange={onCheckedChange}
          aria-describedby="scope-help"
          aria-invalid="true"
        >
          학생 쓰기
        </Checkbox>
      </form>,
    );

    const checkbox = screen.getByRole("checkbox", { name: "학생 쓰기" }) as HTMLInputElement;
    expect(checkbox.name).toBe("writeScope");
    expect(checkbox.value).toBe("true");
    expect(checkbox.required).toBe(true);
    expect(checkbox.getAttribute("aria-describedby")).toBe("scope-help");
    expect(checkbox.getAttribute("aria-invalid")).toBe("true");
    expect(new FormData(container.querySelector("form") as HTMLFormElement).get("writeScope")).toBe("true");

    fireEvent.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it("announces success notices as status messages", () => {
    render(<StatusNotice tone="success">API 키를 삭제했어요.</StatusNotice>);

    expect(screen.getByRole("status").textContent).toContain("API 키를 삭제했어요.");
  });

  it("copies documentation URLs, announces success, and resets the copied state", async () => {
    const writeText = jest.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    jest.useFakeTimers();
    render(<CopyDocumentationControl />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "복사하기" }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("https://docs.example.test/reference");
    expect(screen.getByRole("button", { name: "복사됨" })).toBeTruthy();
    expect(screen.getByText("복사됐어요")).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1800);
    });

    expect(screen.getByRole("button", { name: "복사하기" })).toBeTruthy();
    expect(screen.queryByText("복사됐어요")).toBeNull();
  });

  it("shows an explicit manual-copy message on failure and clears it after a successful retry", async () => {
    const writeText = jest
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("clipboard unavailable"))
      .mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<CopyDocumentationControl />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "복사하기" }));
      await Promise.resolve();
    });

    expect(screen.getByText("복사하지 못했어요. 텍스트를 직접 선택해 복사해주세요.")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "복사하기" }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("복사하지 못했어요. 텍스트를 직접 선택해 복사해주세요.")).toBeNull();
    expect(screen.getByRole("button", { name: "복사됨" })).toBeTruthy();
  });
});
