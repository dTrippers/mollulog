/**
 * @jest-environment jsdom
 */
import "./layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { PageToolbar, ScreenTabs, type ScreenTabItem, V2Page } from "~/components/v2/layout";
import { installLayoutTestEnv, setLayoutWidth, setSentinelIntersecting } from "./layout-test-env";

function Icon() {
  return null;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}|${JSON.stringify(location.state)}`}</output>;
}

function Tabs({ items }: { items: ScreenTabItem[] }) {
  return (
    <MemoryRouter initialEntries={["/futures"]}>
      <V2Page width="wide">
        <PageToolbar>
          <ScreenTabs items={items} />
        </PageToolbar>
      </V2Page>
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("ScreenTabs", () => {
  beforeEach(() => {
    installLayoutTestEnv();
  });

  it("renders a link tab with aria-current and passes link state on navigation", () => {
    render(
      <Tabs
        items={[
          { key: "a", text: "타임라인", Icon, active: true, link: "/futures", linkState: { view: "timeline" } },
          { key: "b", text: "목록", label: "24", Icon, link: "/futures/list", linkState: { view: "list" } },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "타임라인" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "목록 24" }).getAttribute("aria-current")).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "목록 24" }));

    expect(screen.getByTestId("location").textContent).toBe('/futures/list|{"view":"list"}');
  });

  it("renders an onClick tab with aria-pressed and calls onClick without navigating", () => {
    const onClick = jest.fn();
    render(
      <Tabs
        items={[
          { key: "a", text: "타임라인", Icon, active: true, onClick: () => {} },
          { key: "b", text: "목록", Icon, onClick },
        ]}
      />,
    );

    const list = screen.getByRole("button", { name: "목록" });
    expect(list.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(list);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location").textContent?.startsWith("/futures|")).toBe(true);
  });

  it("does not navigate from a disabled link tab and shows its reason", () => {
    render(
      <Tabs
        items={[
          { key: "a", text: "타임라인", Icon, active: true, link: "/futures" },
          { key: "c", text: "지난 일정", Icon, disabled: true, disabledReason: "지난 일정은 아직 준비 중입니다", link: "/futures/past" },
        ]}
      />,
    );

    const past = screen.getByRole("button", { name: /지난 일정/ });
    expect(past.hasAttribute("disabled")).toBe(true);
    expect(past.getAttribute("title")).toBe("지난 일정은 아직 준비 중입니다");
    fireEvent.click(past);

    expect(screen.getByTestId("location").textContent?.startsWith("/futures|")).toBe(true);
  });

  it("marks tabs hidden in stacked layout with the stacked-hidden class", () => {
    render(
      <Tabs
        items={[
          { key: "a", text: "타임라인", Icon, active: true, link: "/futures" },
          { key: "d", text: "일정표", Icon, link: "/futures/table", hiddenStacked: true },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "일정표" }).classList.contains("v2-hidden-stacked")).toBe(true);
    expect(screen.getByRole("link", { name: "타임라인" }).classList.contains("v2-hidden-stacked")).toBe(false);
  });

  it("marks the active tab for the CSS first-paint bar and lets the measured indicator take over", () => {
    const { container } = render(
      <Tabs
        items={[
          { key: "a", text: "타임라인", Icon, active: true, link: "/futures" },
          { key: "b", text: "목록", Icon, link: "/futures/list" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "타임라인" }).classList.contains("v2-tab-active")).toBe(true);
    expect(screen.getByRole("link", { name: "목록" }).classList.contains("v2-tab-active")).toBe(false);
    // The nav reports the measured indicator once the layout effect has run.
    expect(container.querySelector("nav")?.getAttribute("data-indicator-ready")).toBe("true");
  });

  it("reports a pinned toolbar through data-sticky", () => {
    const { container } = render(
      <Tabs items={[{ key: "a", text: "타임라인", Icon, active: true, link: "/futures" }]} />,
    );
    const toolbar = container.querySelector(".v2-toolbar") as HTMLElement;
    expect(toolbar.getAttribute("data-sticky")).toBe("false");

    setSentinelIntersecting(false);

    expect(toolbar.getAttribute("data-sticky")).toBe("true");
  });

  it("scrolls the active tab into the horizontal list", () => {
    render(
      <Tabs
        items={[
          { key: "a", text: "타임라인", Icon, link: "/futures" },
          { key: "b", text: "목록", Icon, active: true, link: "/futures/list" },
        ]}
      />,
    );

    expect(Element.prototype.scrollTo).toHaveBeenCalled();
  });

  it("places the indicator on the active tab's box at its own width, and re-measures on resize", () => {
    const original = Element.prototype.getBoundingClientRect;
    let activeWidth = 72;
    // Tabs report their own boxes. The indicator is not read, so its transform cannot skew the expected geometry.
    Element.prototype.getBoundingClientRect = function boxFor(this: Element) {
      const isActive = this.getAttribute("data-active") === "true";
      const left = isActive ? 140 : 0;
      const width = isActive ? activeWidth : 100;
      return { x: left, y: 0, left, top: 0, right: left + width, bottom: 40, width, height: 40, toJSON: () => ({}) } as DOMRect;
    };
    try {
      const { container } = render(
        <Tabs
          items={[
            { key: "a", text: "타임라인", Icon, link: "/futures" },
            { key: "b", text: "목록", Icon, active: true, link: "/futures/list" },
          ]}
        />,
      );
      const indicator = container.querySelector<HTMLElement>("nav span.pointer-events-none");
      expect(container.querySelector(".v2-tabs-list")).not.toBeNull();
      // The bar is inset by the tab's px-3 (0.75rem) on both sides.
      expect(indicator?.style.width).toBe("calc(72px - 1.5rem)");
      expect(indicator?.style.transform).toBe("translateX(calc(140px + 0.75rem))");

      activeWidth = 90;
      setLayoutWidth(390);

      expect(indicator?.style.width).toBe("calc(90px - 1.5rem)");
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it("places the first measured indicator without a transition, and animates only later moves", async () => {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function boxFor(this: Element) {
      const isActive = this.getAttribute("data-active") === "true";
      const left = isActive ? 140 : 0;
      const width = isActive ? 72 : 100;
      return { x: left, y: 0, left, top: 0, right: left + width, bottom: 40, width, height: 40, toJSON: () => ({}) } as DOMRect;
    };
    try {
      const { container } = render(
        <Tabs
          items={[
            { key: "a", text: "타임라인", Icon, link: "/futures" },
            { key: "b", text: "목록", Icon, active: true, link: "/futures/list" },
          ]}
        />,
      );
      const indicator = container.querySelector<HTMLElement>("nav span.pointer-events-none") as HTMLElement;

      // The first measured position is already applied, and the transition class is not yet present.
      expect(indicator.style.transform).toBe("translateX(calc(140px + 0.75rem))");
      expect(indicator.className).not.toContain("transition-transform");

      await waitFor(() => expect(indicator.className).toContain("motion-safe:transition-transform"));
      expect(indicator.style.transform).toBe("translateX(calc(140px + 0.75rem))");
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it("crossfades an onClick tab through the view transition API and clears the attribute afterwards", async () => {
    let finish: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let attributeDuringCallback: string | null = null;
    const startViewTransition = jest.fn((callback: () => void) => {
      callback();
      attributeDuringCallback = document.documentElement.getAttribute("data-v2-transition");
      return { finished } as unknown as ViewTransition;
    });
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: startViewTransition });
    const onClick = jest.fn();

    try {
      render(
        <Tabs
          items={[
            { key: "a", text: "타임라인", Icon, active: true, onClick: () => {} },
            { key: "b", text: "목록", Icon, onClick },
          ]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "목록" }));

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(startViewTransition).toHaveBeenCalledTimes(1);
      expect(attributeDuringCallback).toBe("crossfade");

      finish();
      await waitFor(() => expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false));
    } finally {
      Reflect.deleteProperty(document, "startViewTransition");
    }
  });
});
