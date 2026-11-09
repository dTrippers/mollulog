/**
 * @jest-environment jsdom
 */
import "./layout-test-polyfills";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Link, MemoryRouter, RouterProvider, useLocation, useNavigate } from "react-router";
import {
  AsideLinks,
  MobileActionBar,
  PageAside,
  PageHeader,
  PageMain,
  V2Page,
  runV2BackNavigation,
  runV2StateTransition,
} from "~/components/v2/layout";
import {
  canUseV2ViewTransition,
  getV2LinkTransitionProps,
  handleV2PopState,
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

function LocationStateProbe() {
  const location = useLocation();
  return <output data-testid="location-state">{JSON.stringify(location.state)}</output>;
}

function setStartViewTransition(value: unknown) {
  Object.defineProperty(document, "startViewTransition", { configurable: true, value });
}

// Calls the transition callback at once and records the kind attribute each time a view transition starts.
function recordViewTransitions() {
  const starts: (string | null)[] = [];
  const startViewTransition = jest.fn((callback: () => unknown) => {
    starts.push(document.documentElement.getAttribute("data-v2-transition"));
    callback();
    return {
      finished: Promise.resolve(),
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: () => {},
    } as unknown as ViewTransition;
  });
  setStartViewTransition(startViewTransition);
  return { startViewTransition, starts };
}

function ListPage({ to }: { to: string }) {
  return (
    <V2Page width="wide">
      <PageHeader title="미래시" />
      <PageMain>
        <Link to={to} {...getV2LinkTransitionProps("forward")}>
          이벤트 상세
        </Link>
      </PageMain>
    </V2Page>
  );
}

function DetailPage() {
  const navigate = useNavigate();
  return (
    <V2Page width="wide">
      <PageHeader title="이벤트 상세" back={{ title: "미래시", onClick: () => navigate(-1) }} />
      <PageMain>상세 본문</PageMain>
    </V2Page>
  );
}

function routesFor(list: string) {
  return [
    { path: list, element: <ListPage to={`${list}/events/1`} /> },
    { path: `${list}/events/1`, element: <DetailPage /> },
  ];
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
    const onClick = jest.fn<() => void>();
    render(
      <MemoryRouter>
        <AsideLinks items={[{ key: "c", title: "계산기 열기", description: "천장까지 필요한 청휘석", Icon, onClick }]} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /계산기 열기/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a title-only item at the normal row height when description is absent", () => {
    render(
      <MemoryRouter>
        <AsideLinks items={[{ key: "shop", title: "상점 계산기", Icon, to: "/shop" }]} />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "상점 계산기" });
    expect(link.className).toContain("min-h-v2-row-min");
    expect(link.className).toContain("items-center");
    expect(link.querySelector(".text-xs")).toBeNull();
  });

  it("renders a badge before the arrow", () => {
    render(
      <MemoryRouter>
        <AsideLinks items={[{ key: "shop", title: "상점 계산기", badge: "종료", Icon, to: "/shop" }]} />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "상점 계산기 종료" });
    const badge = screen.getByText("종료");
    const arrow = link.querySelector("svg");
    expect(badge.className).toContain("text-v2-fg-tertiary");
    expect(arrow).not.toBeNull();
    expect(badge.compareDocumentPosition(arrow!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders disabled items dimmed, without a link or arrow, and explains them behind an info button", () => {
    const { container } = render(
      <MemoryRouter>
        <AsideLinks
          items={[{ key: "shop", title: "상점 계산기", disabledReason: "상점이 없거나 정보를 준비 중이에요", Icon }]}
        />
      </MemoryRouter>,
    );

    const row = container.querySelector('[aria-disabled="true"]');
    expect(row).not.toBeNull();
    expect(row?.querySelector("a")).toBeNull();
    expect(row?.className).not.toContain("hover:bg-v2-hover");
    expect(row?.querySelector(".text-v2-fg-disabled")?.textContent).toBe("상점 계산기");
    // The reason moves behind the info button instead of a description line, and there is no trailing arrow.
    expect(row?.querySelector(".text-xs")).toBeNull();
    const buttons = row?.querySelectorAll("button") ?? [];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe("상점 계산기를 쓸 수 없어요: 상점이 없거나 정보를 준비 중이에요");
    expect(buttons[0]?.getAttribute("aria-haspopup")).toBe("dialog");
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

  it("forwards linkState through an internal AsideLinks link", () => {
    const state = { __mllg: { source: "futures", contentUid: "event-1" } };
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <AsideLinks items={[{ key: "shop", title: "상점 계산기", Icon, to: "/events/1/shop", linkState: state }]} />
        <LocationStateProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "상점 계산기" }));

    expect(screen.getByTestId("location-state").textContent).toBe(JSON.stringify(state));
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
    expect(filter.className).toContain("active:bg-v2-filled-hover");
    expect(calc.className).toContain("active:bg-v2-filled-hover");
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
    const update = jest.fn<() => void>();

    runV2StateTransition("crossfade", update);

    expect(update).toHaveBeenCalledTimes(1);
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });

  it("the v2 back action arms reverse and never starts a view transition itself", () => {
    jest.useFakeTimers();
    const startViewTransition = jest.fn((callback: () => unknown) => {
      callback();
      return { finished: Promise.resolve() } as unknown as ViewTransition;
    });
    setStartViewTransition(startViewTransition);
    const navigateBack = jest.fn<() => void>();

    runV2BackNavigation(navigateBack);

    expect(navigateBack).toHaveBeenCalledTimes(1);
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("reverse");
    act(() => {
      jest.runOnlyPendingTimers();
    });
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

  it("clears by the pending fallback when the navigation never commits", () => {
    jest.useFakeTimers();
    setImmediateViewTransition();

    getV2LinkTransitionProps("forward").onClick?.({} as never);
    act(() => {
      jest.advanceTimersByTime(29_999);
    });
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("forward");

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });

  it("keeps the kind of a pending navigation past ten seconds, until the pending fallback", () => {
    jest.useFakeTimers();
    setImmediateViewTransition();

    getV2LinkTransitionProps("forward").onClick?.({} as never);
    act(() => {
      jest.advanceTimersByTime(10_001);
    });
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("forward");

    act(() => {
      jest.advanceTimersByTime(19_998);
    });
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("forward");

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });

  it("lets a newer click replace the pending kind and restart the fallback", () => {
    jest.useFakeTimers();
    setImmediateViewTransition();

    getV2LinkTransitionProps("forward").onClick?.({} as never);
    act(() => {
      jest.advanceTimersByTime(25_000);
    });
    getV2LinkTransitionProps("reverse").onClick?.({} as never);
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("reverse");

    // The first click's fallback would have fired five seconds from here. The newer click restarts the fallback.
    act(() => {
      jest.advanceTimersByTime(29_999);
    });
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("reverse");

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });

  it("a stale settle timer cannot clear a newer kind", () => {
    jest.useFakeTimers();
    setImmediateViewTransition();

    getV2LinkTransitionProps("forward").onClick?.({} as never);
    settleV2LinkTransition();
    act(() => {
      jest.advanceTimersByTime(200);
    });
    // The forward kind's settle timer would fire 200 ms from here, while the newer kind is still pending its commit.
    getV2LinkTransitionProps("reverse").onClick?.({} as never);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("reverse");

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it("a state update inside an earlier settle window keeps its own kind until it finishes", async () => {
    jest.useFakeTimers();
    let finish: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    setStartViewTransition((callback: () => unknown) => {
      callback();
      return { finished } as unknown as ViewTransition;
    });

    getV2LinkTransitionProps("forward").onClick?.({} as never);
    settleV2LinkTransition();
    act(() => {
      jest.advanceTimersByTime(200);
    });
    runV2StateTransition("crossfade", () => {});
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("crossfade");

    await act(async () => {
      finish();
    });
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });

  it("a state transition that finishes after a newer kind is armed cannot clear that kind", async () => {
    jest.useFakeTimers();
    let finish: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    setStartViewTransition((callback: () => unknown) => {
      callback();
      return { finished } as unknown as ViewTransition;
    });

    runV2StateTransition("crossfade", () => {});
    getV2LinkTransitionProps("reverse").onClick?.({} as never);
    await act(async () => {
      finish();
    });

    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("reverse");
    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it("a browser popstate drops a pending link kind, unless the back action started the POP", () => {
    jest.useFakeTimers();
    setImmediateViewTransition();

    getV2LinkTransitionProps("forward").onClick?.({} as never);
    handleV2PopState();
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);

    getV2LinkTransitionProps("forward").onClick?.({} as never);
    runV2BackNavigation(() => handleV2PopState());
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("reverse");

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it("link forward then v2 back starts one view transition, owned by React Router, and keeps reverse until settle", async () => {
    const { startViewTransition, starts } = recordViewTransitions();
    const router = createMemoryRouter(routesFor("/list-back"), { initialEntries: ["/list-back"] });
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByRole("link", { name: "이벤트 상세" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/list-back/events/1"));
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(starts).toEqual(["forward"]);

    fireEvent.click(screen.getByRole("button", { name: "미래시" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/list-back"));

    // One call for the back navigation, made by React Router. The v2 back action never calls startViewTransition itself.
    expect(startViewTransition).toHaveBeenCalledTimes(2);
    expect(starts[1]).toBe("reverse");
    expect(document.documentElement.getAttribute("data-v2-transition")).toBe("reverse");
    await waitFor(() => expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false));
  });

  it("a plain browser back after a link forward carries no v2 kind", async () => {
    const { startViewTransition, starts } = recordViewTransitions();
    const router = createMemoryRouter(routesFor("/list-plain"), { initialEntries: ["/list-plain"] });
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByRole("link", { name: "이벤트 상세" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/list-plain/events/1"));
    await waitFor(() => expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false));

    act(() => {
      void router.navigate(-1);
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/list-plain"));

    // The POP is transitioned by React Router, with no v2 kind set when it starts or after it commits.
    expect(startViewTransition).toHaveBeenCalledTimes(2);
    expect(starts[1]).toBeNull();
    expect(document.documentElement.hasAttribute("data-v2-transition")).toBe(false);
  });
});
