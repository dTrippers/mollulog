/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useRef } from "react";
import { Popover } from "~/components/v2/primitives/Popover";

function Harness({
  open,
  onClose,
  placement = "auto",
}: {
  open: boolean;
  onClose: () => void;
  placement?: "auto" | "above";
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} type="button">
        trigger
      </button>
      <Popover open={open} label="테스트" onClose={onClose} returnFocusRef={triggerRef} placement={placement}>
        <button type="button">first</button>
        <button type="button">second</button>
      </Popover>
    </>
  );
}

function EmptyHarness({
  open,
  onClose,
  focusPanelIfNoFocusable = false,
}: {
  open: boolean;
  onClose: () => void;
  focusPanelIfNoFocusable?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} type="button">
        trigger
      </button>
      <Popover
        open={open}
        label="테스트"
        onClose={onClose}
        returnFocusRef={triggerRef}
        focusPanelIfNoFocusable={focusPanelIfNoFocusable}
      >
        <p>no controls</p>
      </Popover>
    </>
  );
}

describe("Popover focus", () => {
  it("focuses the first control when it opens", () => {
    const { rerender } = render(<Harness open={false} onClose={() => undefined} />);
    rerender(<Harness open onClose={() => undefined} />);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
  });

  it("focuses the panel when opted in and there is no enabled control", () => {
    const { rerender } = render(<EmptyHarness open={false} onClose={() => undefined} focusPanelIfNoFocusable />);
    rerender(<EmptyHarness open onClose={() => undefined} focusPanelIfNoFocusable />);

    const panel = screen.getByRole("dialog", { name: "테스트" });
    expect((panel as HTMLElement).tabIndex).toBe(-1);
    expect(document.activeElement).toBe(panel);
  });

  it("does not focus an empty panel unless the fallback is opted in", () => {
    const { rerender } = render(<EmptyHarness open={false} onClose={() => undefined} />);
    rerender(<EmptyHarness open onClose={() => undefined} />);

    expect(document.activeElement).not.toBe(screen.getByRole("dialog", { name: "테스트" }));
  });

  it("keeps focus where the user moved it when the parent rerenders with a new onClose", () => {
    const { rerender } = render(<Harness open={false} onClose={() => undefined} />);
    rerender(<Harness open onClose={() => undefined} />);
    const second = screen.getByRole("button", { name: "second" });
    second.focus();

    // A new inline arrow each render, as StudentSlot passes it.
    rerender(<Harness open onClose={() => undefined} />);
    rerender(<Harness open onClose={() => undefined} />);

    expect(document.activeElement).toBe(second);
  });

  it("closes on Escape through the latest onClose", () => {
    const first = jest.fn<() => void>();
    const latest = jest.fn<() => void>();
    const { rerender } = render(<Harness open={false} onClose={first} />);
    rerender(<Harness open onClose={first} />);
    rerender(<Harness open onClose={latest} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });
});

describe("Popover placement", () => {
  it("renders the panel on the body, outside the container that would clip it", () => {
    // A scroll container with overflow hidden, as the schedule table has.
    const { container, rerender } = render(
      <div style={{ overflow: "hidden" }}>
        <Harness open={false} onClose={() => undefined} />
      </div>,
    );
    rerender(
      <div style={{ overflow: "hidden" }}>
        <Harness open onClose={() => undefined} />
      </div>,
    );

    const dialog = screen.getByRole("dialog", { name: "테스트" });
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("flips above the trigger when the panel does not fit below, and clamps to the viewport", () => {
    const originalHeight = window.innerHeight;
    window.innerHeight = 700;
    const height = jest.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(200);
    try {
      const { rerender } = render(<Harness open={false} onClose={() => undefined} />);
      const trigger = screen.getByRole("button", { name: "trigger" });
      Object.defineProperty(trigger, "getBoundingClientRect", {
        value: () => ({ top: 600, bottom: 640, left: 20, right: 60, width: 40, height: 40 }),
      });

      rerender(<Harness open onClose={() => undefined} />);

      const dialog = screen.getByRole("dialog", { name: "테스트" }) as HTMLElement;
      expect(dialog.style.top).toBe("392px");
      expect(dialog.style.left).toBe("20px");
    } finally {
      height.mockRestore();
      window.innerHeight = originalHeight;
    }
  });

  it("honors forced above placement even when the panel fits below", () => {
    const originalHeight = window.innerHeight;
    window.innerHeight = 700;
    const height = jest.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(200);
    try {
      const { rerender } = render(<Harness open={false} onClose={() => undefined} placement="above" />);
      const trigger = screen.getByRole("button", { name: "trigger" });
      Object.defineProperty(trigger, "getBoundingClientRect", {
        value: () => ({ top: 300, bottom: 340, left: 20, right: 60, width: 40, height: 40 }),
      });

      rerender(<Harness open onClose={() => undefined} placement="above" />);

      const dialog = screen.getByRole("dialog", { name: "테스트" }) as HTMLElement;
      expect(dialog.getAttribute("data-placement")).toBe("above");
      expect(dialog.style.top).toBe("92px");
    } finally {
      height.mockRestore();
      window.innerHeight = originalHeight;
    }
  });
});

// A slot holds the thumbnail and the name, and the trigger is only the thumbnail, as in the students quick view.
function AnchoredHarness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div ref={slotRef}>
      <button ref={triggerRef} type="button">
        trigger
      </button>
      <span>이름</span>
      <Popover open={open} label="테스트" onClose={onClose} returnFocusRef={triggerRef} anchorRef={slotRef}>
        <button type="button">first</button>
      </Popover>
    </div>
  );
}

function stubRect(element: Element, rect: { top: number; bottom: number; left: number }) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      ...rect,
      x: rect.left,
      y: rect.top,
      right: rect.left + 40,
      width: 40,
      height: rect.bottom - rect.top,
      toJSON: () => ({}),
    }),
  });
}

describe("Popover anchor", () => {
  it("places the panel under the anchor block, not under the trigger", () => {
    const { container, rerender } = render(<AnchoredHarness open={false} onClose={() => undefined} />);
    stubRect(container.firstElementChild as HTMLElement, { top: 60, bottom: 200, left: 300 });
    stubRect(screen.getByRole("button", { name: "trigger" }), { top: 60, bottom: 100, left: 300 });

    rerender(<AnchoredHarness open onClose={() => undefined} />);

    // The anchor's bottom edge plus the 8px gap, which is 8px under the name label.
    expect((screen.getByRole("dialog", { name: "테스트" }) as HTMLElement).style.top).toBe("208px");
  });

  it("treats a press inside the anchor, off the trigger, as inside", () => {
    const onClose = jest.fn<() => void>();
    const { rerender } = render(<AnchoredHarness open={false} onClose={onClose} />);
    rerender(<AnchoredHarness open onClose={onClose} />);

    fireEvent.pointerDown(screen.getByText("이름"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("flips above the anchor block, leaving the gap above its top edge", () => {
    const originalHeight = window.innerHeight;
    window.innerHeight = 700;
    const height = jest.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(200);
    try {
      const { container, rerender } = render(<AnchoredHarness open={false} onClose={() => undefined} />);
      stubRect(container.firstElementChild as HTMLElement, { top: 600, bottom: 640, left: 300 });

      rerender(<AnchoredHarness open onClose={() => undefined} />);

      const dialog = screen.getByRole("dialog", { name: "테스트" }) as HTMLElement;
      expect(dialog.getAttribute("data-placement")).toBe("above");
      // The panel's bottom edge sits 8px above the anchor's top edge: 392 + 200 = 600 - 8.
      expect(dialog.style.top).toBe("392px");
    } finally {
      height.mockRestore();
      window.innerHeight = originalHeight;
    }
  });

  it("settles an above-placed panel from the trigger side, under motion-safe only", () => {
    const source = readFileSync(join(process.cwd(), "app/components/v2/primitives/Popover.tsx"), "utf8");

    expect(source).toContain("data-[placement=above]:motion-safe:translate-y-1");
    expect(source).toContain("enterFrom={hiddenPanelMotion}");
    expect(source).toContain("leaveTo={hiddenPanelMotion}");
    expect(source).toContain("data-placement={placement}");
  });
});

// Records what the popover observes, and lets a test fire the callback as a browser does when a size changes.
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  targets: Element[] = [];
  callback: () => void;

  constructor(callback: () => void) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  unobserve() {}

  disconnect() {
    FakeResizeObserver.instances = FakeResizeObserver.instances.filter((observer) => observer !== this);
  }
}

describe("Popover follows size changes", () => {
  it("moves an above-placed panel by the height it grows", () => {
    const originalHeight = window.innerHeight;
    const originalResizeObserver = globalThis.ResizeObserver;
    window.innerHeight = 700;
    FakeResizeObserver.instances = [];
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    const height = jest.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(200);
    try {
      const { container, rerender } = render(<AnchoredHarness open={false} onClose={() => undefined} />);
      const slot = container.firstElementChild as HTMLElement;
      stubRect(slot, { top: 600, bottom: 640, left: 300 });
      rerender(<AnchoredHarness open onClose={() => undefined} />);
      const dialog = screen.getByRole("dialog", { name: "테스트" }) as HTMLElement;
      expect(dialog.style.top).toBe("392px");

      // A control is added to the panel, so it grows from 200 to 240px. The panel must move up by the 40px it grew.
      height.mockReturnValue(240);
      act(() => {
        for (const observer of FakeResizeObserver.instances) {
          observer.callback();
        }
      });

      expect(dialog.style.top).toBe("352px");
      expect(FakeResizeObserver.instances.some((observer) => observer.targets.includes(slot))).toBe(true);
      expect(FakeResizeObserver.instances.some((observer) => observer.targets.includes(dialog))).toBe(true);
    } finally {
      height.mockRestore();
      window.innerHeight = originalHeight;
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });
});
