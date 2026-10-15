/**
 * @jest-environment jsdom
 */
import "./layout-test-polyfills";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import {
  AsideLinks,
  MobileActionBar,
  PageAside,
  PageHeader,
  PageMain,
  V2Page,
  runV2ReverseTransition,
  runV2StateTransition,
} from "~/components/v2/layout";
import {
  canUseV2ViewTransition,
  getV2LinkTransitionProps,
  settleV2LinkTransition,
} from "~/components/v2/layout/screen-transition";
import { installLayoutTestEnv } from "./layout-test-env";

function Icon() {
  return null;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function setStartViewTransition(value: unknown) {
  Object.defineProperty(document, "startViewTransition", { configurable: true, value });
}

describe("AsideLinks", () => {
  beforeEach(() => {
    installLayoutTestEnv();
  });

  it("opens an external link in a new window with noopener noreferrer", () => {
    render(
      <MemoryRouter>
        <AsideLinks items={[{ key: "x", title: "일본 서버 공지", description: "공식 사이트", Icon, to: "https://example.com/notice" }]} />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: /일본 서버 공지/ });
    expect(link.getAttribute("href")).toBe("https://example.com/notice");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("gives an external link the hidden new-window notice in its accessible name, and keeps the ↗ icon", () => {
    const { container } = render(
      <MemoryRouter>
        <AsideLinks items={[{ key: "x", title: "일본 서버 공지", description: "공식 사이트", Icon, to: "https://example.com/notice" }]} />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: /새 창에서 열림$/ });
    expect(link.getAttribute("href")).toBe("https://example.com/notice");
    expect(link.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("svg.size-4")).not.toBeNull();
    expect(link.querySelector(".sr-only")?.textContent).toBe("새 창에서 열림");
  });

  it("renders an onClick item as a button that calls onClick", () => {
    const onClick = jest.fn();
    render(
      <MemoryRouter>
        <AsideLinks items={[{ key: "c", title: "계산기 열기", description: "천장까지 필요한 청휘석", Icon, onClick }]} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /계산기 열기/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("navigates an internal link without a transition when the API is missing", () => {
    render(
      <MemoryRouter initialEntries={["/futures"]}>
        <AsideLinks items={[{ key: "d", title: "이벤트 상세", description: "상세 보기", Icon, to: "/events/1", transition: "forward" }]} />
        <LocationProbe />
      </MemoryRouter>,
    );

    const internal = screen.getByRole("link", { name: /이벤트 상세/ });
    expect(internal.textContent).not.toContain("새 창");
    fireEvent.click(internal);

    expect(screen.getByTestId("location").textContent).toBe("/events/1");
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });
});

describe("MobileActionBar", () => {
  beforeEach(() => {
    installLayoutTestEnv();
  });

  it("renders links before panel entries, uses shortTitle for the label, and marks external links", () => {
    render(
      <MemoryRouter>
        <V2Page width="wide">
          <PageHeader title="미래시" />
          <PageMain>본문</PageMain>
          <MobileActionBar
            links={[
              { key: "calc", title: "픽업 확률 계산기", shortTitle: "계산기", Icon, to: "/tools/calc" },
              { key: "notice", title: "일본 서버 공지", shortTitle: "공지", Icon, to: "https://example.com/notice" },
            ]}
            panels={[{ panelId: "filter", title: "컨텐츠 필터", shortTitle: "필터", Icon }]}
          />
        </V2Page>
      </MemoryRouter>,
    );

    const calc = screen.getByRole("link", { name: "계산기" });
    const notice = screen.getByRole("link", { name: "공지 (새 창)" });
    const filter = screen.getByRole("button", { name: "필터" });

    expect(calc.getAttribute("href")).toBe("/tools/calc");
    expect(calc.querySelector("svg.size-3")).toBeNull();
    expect(notice.getAttribute("href")).toBe("https://example.com/notice");
    expect(notice.getAttribute("target")).toBe("_blank");
    expect(notice.getAttribute("rel")).toBe("noopener noreferrer");
    expect(notice.querySelector("svg.size-3")).not.toBeNull();
    expect(calc.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filter.getAttribute("aria-haspopup")).toBe("dialog");
    expect(filter.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("screen transition helper", () => {
  beforeEach(() => {
    installLayoutTestEnv();
    document.documentElement.removeAttribute("data-v2-transition");
  });

  afterEach(() => {
    Reflect.deleteProperty(document, "startViewTransition");
    jest.useRealTimers();
  });

  it("reports unsupported when the document is hidden or the API is missing", () => {
    expect(canUseV2ViewTransition({ visibilityState: "visible" })).toBe(false);
    expect(canUseV2ViewTransition({ visibilityState: "hidden", startViewTransition: () => ({}) as ViewTransition })).toBe(false);
    expect(canUseV2ViewTransition({ visibilityState: "visible", startViewTransition: () => ({}) as ViewTransition })).toBe(true);
  });

  it("applies a state update immediately when the API is missing", () => {
    const update = jest.fn();

    runV2StateTransition("crossfade", update);

    expect(update).toHaveBeenCalledTimes(1);
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });

  it("runs a reverse action after the view transition callback and clears the attribute", async () => {
    let resolveFinished: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    setStartViewTransition((callback: () => unknown) => {
      callback();
      return { finished } as unknown as ViewTransition;
    });
    const action = jest.fn(async () => {});

    const pending = runV2ReverseTransition(action);
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("reverse");
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFinished();
      await pending;
    });
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });

  function setImmediateViewTransition() {
    setStartViewTransition((callback: () => unknown) => {
      callback();
      return { finished: Promise.resolve() } as unknown as ViewTransition;
    });
  }

  const eventLink = { key: "d", title: "이벤트 상세", description: "상세 보기", Icon, to: "/events/1", transition: "forward" as const };

  it("keeps a link transition attribute while its navigation is pending past one second", () => {
    jest.useFakeTimers();
    setImmediateViewTransition();

    getV2LinkTransitionProps("forward").onClick?.({} as never);
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("forward");

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("forward");

    settleV2LinkTransition();
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });

  it("clears the attribute a settle delay after the navigation commits, not at a fixed time from the click", () => {
    jest.useFakeTimers();
    setImmediateViewTransition();
    render(
      <MemoryRouter initialEntries={["/futures"]}>
        <V2Page width="wide">
          <PageHeader title="미래시" />
          <PageMain>본문</PageMain>
          <PageAside>
            <AsideLinks items={[eventLink]} />
          </PageAside>
        </V2Page>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: /이벤트 상세/ }));
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("forward");

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("forward");

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });

  it("clears by the safety fallback when the navigation never commits", () => {
    jest.useFakeTimers();
    setImmediateViewTransition();

    getV2LinkTransitionProps("forward").onClick?.({} as never);
    act(() => {
      jest.advanceTimersByTime(9999);
    });
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("forward");

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });

  it("settles a pending link transition a settle delay after V2Page unmounts, not at the fallback", () => {
    jest.useFakeTimers();
    setImmediateViewTransition();
    const { unmount } = render(
      <MemoryRouter initialEntries={["/futures"]}>
        <V2Page width="wide">
          <PageMain>본문</PageMain>
        </V2Page>
      </MemoryRouter>,
    );

    getV2LinkTransitionProps("forward").onClick?.({} as never);
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("forward");

    unmount();
    act(() => {
      jest.advanceTimersByTime(399);
    });
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("forward");

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });

  it("lets a newer click replace the pending kind and restart the fallback", () => {
    jest.useFakeTimers();
    setImmediateViewTransition();

    getV2LinkTransitionProps("forward").onClick?.({} as never);
    act(() => {
      jest.advanceTimersByTime(9000);
    });
    getV2LinkTransitionProps("reverse").onClick?.({} as never);
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("reverse");

    // The first click's fallback would have fired 1000ms from here. The newer click restarts it.
    act(() => {
      jest.advanceTimersByTime(9999);
    });
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("reverse");

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });
});
