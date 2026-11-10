/**
 * @jest-environment jsdom
 */
import "./layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PageAside, PageHeader, PageMain, PageToolbar, ScreenTabs, V2Page } from "~/components/v2/layout";
import type { V2PageWidth } from "~/components/v2/layout";
import { installLayoutTestEnv, setLayoutWidth } from "./layout-test-env";

function Icon() {
  return null;
}

function Layout({
  width = "wide",
  withAside = true,
  backOnClick,
  meta,
}: {
  width?: V2PageWidth;
  withAside?: boolean;
  backOnClick?: () => void;
  meta?: string;
}) {
  return (
    <V2Page width={width}>
      <PageHeader
        title="미래시"
        description="일본 서버를 바탕으로 추정된 일정"
        back={backOnClick ? { title: "뒤로", onClick: backOnClick } : { title: "미래시 목록", to: "/futures" }}
        meta={meta}
      />
      <PageToolbar>
        <ScreenTabs items={[{ key: "timeline", text: "타임라인", Icon, active: true, onClick: () => {} }]} />
      </PageToolbar>
      <PageMain>
        <p>본문</p>
      </PageMain>
      {withAside ? (
        <PageAside>
          <p>보조</p>
        </PageAside>
      ) : null}
    </V2Page>
  );
}

function renderLayout(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function layoutRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>("[data-v2-layout]");
  if (!root) {
    throw new Error("V2Page root not rendered");
  }
  return root;
}

describe("V2Page layout parts", () => {
  beforeEach(() => {
    installLayoutTestEnv();
  });

  it("renders Header, Toolbar, Main, Aside in DOM order", () => {
    const { container } = renderLayout(<Layout />);
    const order = Array.from(layoutRoot(container).children).map((child) => child.className);
    const classes = order.map((className) => className.split(" ").find((name) => name.startsWith("v2-")) ?? "");

    expect(classes).toEqual(["v2-header", "v2-toolbar-sentinel", "v2-toolbar", "v2-main", "v2-aside"]);
    expect(screen.getByRole("complementary", { name: "보조 도구" })).toBeTruthy();
  });

  it("renders no Aside element when the screen omits PageAside", () => {
    const { container } = renderLayout(<Layout withAside={false} />);

    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector(".v2-aside")).toBeNull();
    expect(screen.getByRole("heading", { name: "미래시" })).toBeTruthy();
  });

  it("puts the page title and description in the header above Main", () => {
    const { container } = renderLayout(<Layout />);
    const header = container.querySelector(".v2-header");
    const main = container.querySelector(".v2-main");

    expect(header?.textContent).toContain("일본 서버를 바탕으로 추정된 일정");
    expect(container.querySelector(".v2-header h1")?.classList.contains("sr-only")).toBe(false);
    expect(header && main ? header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING : 0).toBeTruthy();
  });

  it("visually hides the title and meta while retaining the title and back link accessibly", () => {
    const { container } = renderLayout(
      <V2Page width="reading">
        <PageHeader title="이벤트 이름" meta="이벤트 · 날짜 · 남은 기간" back={{ title: "이벤트", to: "/events" }} titleHidden />
      </V2Page>,
    );
    const heading = container.querySelector(".v2-header h1");
    const meta = container.querySelector(".v2-header div.sr-only");
    const back = screen.getByRole("link", { name: "이벤트" });

    expect(heading?.classList.contains("sr-only")).toBe(true);
    expect(screen.getByRole("heading", { name: "이벤트 이름" })).toBeTruthy();
    expect(meta?.textContent).toBe("이벤트 · 날짜 · 남은 기간");
    expect(back.getAttribute("href")).toBe("/events");
    expect(back.classList.contains("mb-2")).toBe(false);
  });

  it("renders the back link as a router link", () => {
    renderLayout(<Layout />);
    const back = screen.getByRole("link", { name: "미래시 목록" });

    expect(back.getAttribute("href")).toBe("/futures");
  });

  it("runs an onClick back action without a view transition when the API is missing", () => {
    const onBack = jest.fn();
    renderLayout(<Layout backOnClick={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders the meta slot in the header", () => {
    renderLayout(<Layout meta="진행 중 · 이벤트 · 10/08 ~ 10/22" />);

    expect(screen.getByText("진행 중 · 이벤트 · 10/08 ~ 10/22")).toBeTruthy();
  });

  it("sets the page max width attribute from the width rule", () => {
    const cases: [V2PageWidth, string, boolean][] = [
      ["reading", "default", true],
      ["wide", "wide", false],
      ["full", "full", false],
    ];
    for (const [width, expectedAttribute, readingClass] of cases) {
      const { container, unmount } = renderLayout(<Layout width={width} />);
      const root = layoutRoot(container);
      expect(root.getAttribute("data-page-max-width")).toBe(expectedAttribute);
      expect(root.querySelector(".v2-main")?.classList.contains("max-w-3xl")).toBe(readingClass);
      unmount();
    }
  });

  it("tracks side-by-side and stacked from the page width", () => {
    const { container } = renderLayout(<Layout />);
    const root = layoutRoot(container);

    setLayoutWidth(390);
    expect(root.getAttribute("data-stacked")).toBe("true");

    setLayoutWidth(1024);
    expect(root.getAttribute("data-stacked")).toBe("false");
  });

  it("measures the first layout before any ResizeObserver callback, and reports it in the same commit", () => {
    // A browser delivers the ResizeObserver callback after the first paint. This observer stays silent, so only the
    // pre-paint measurement can set the layout.
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    const onStackedChange = jest.fn();
    try {
      setLayoutWidth(1024);
      const { container } = render(
        <MemoryRouter>
          <V2Page width="wide" onStackedChange={onStackedChange}>
            <p>본문</p>
          </V2Page>
        </MemoryRouter>,
      );

      expect(layoutRoot(container).getAttribute("data-stacked")).toBe("false");
      expect(onStackedChange).toHaveBeenLastCalledWith(false);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });

  it("keeps a trailing action beside the heading at every width only when asked to", () => {
    const { container, rerender } = renderLayout(
      <V2Page width="wide">
        <PageHeader title="프로필" trailing={<button type="button">관리</button>} />
      </V2Page>,
    );
    expect(container.querySelector(".v2-header")?.className).toContain("flex-col");

    rerender(
      <MemoryRouter>
        <V2Page width="wide">
          <PageHeader title="프로필" trailing={<button type="button">관리</button>} trailingInline />
        </V2Page>
      </MemoryRouter>,
    );
    const header = container.querySelector(".v2-header");
    expect(header?.className).toContain("flex-row");
    expect(header?.className).not.toContain("flex-col");
    expect(screen.getByRole("button", { name: "관리" })).toBeTruthy();
  });

  it("puts details under the heading row at full width and centers a lone title beside the media", () => {
    const { container } = render(
      <MemoryRouter>
        <V2Page width="wide">
          <PageHeader
            title="프로필"
            media={<span>아바타</span>}
            trailing={<button type="button">관리</button>}
            trailingInline
            details={<p>소개</p>}
          />
        </V2Page>
      </MemoryRouter>,
    );
    const header = container.querySelector(".v2-header") as HTMLElement;
    const [row, details] = Array.from(header.children);
    expect(row.className).toContain("flex-row");
    expect(row.className).toContain("items-center");
    expect(row.contains(screen.getByRole("button", { name: "관리" }))).toBe(true);
    expect(details.textContent).toBe("소개");
    expect(row.contains(screen.getByText("소개"))).toBe(false);
  });
});
