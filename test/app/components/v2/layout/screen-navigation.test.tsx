/**
 * @jest-environment jsdom
 */
import "./layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import {
  PageAside,
  PageHeader,
  PageMain,
  ScreenNavigation,
  ScreenNavigationFocusScope,
  ScreenNavigationToolbar,
  type ScreenTabItem,
  V2Page,
} from "~/components/v2/layout";
import { installLayoutTestEnv, setLayoutWidth } from "./layout-test-env";

function Icon() {
  return null;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}|{JSON.stringify(location.state)}</output>;
}

function NavigationShell({ items }: { items: ScreenTabItem[] }) {
  return (
    <MemoryRouter initialEntries={["/developers"]}>
      <V2Page width="wide">
        <PageHeader title="API" />
        <ScreenNavigationFocusScope>
          <ScreenNavigationToolbar items={items} />
          <PageAside>
            <ScreenNavigation items={items} />
          </PageAside>
        </ScreenNavigationFocusScope>
        <PageMain>
          <input aria-label="본문 입력" />
          본문
        </PageMain>
      </V2Page>
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("responsive ScreenNavigation", () => {
  beforeEach(() => {
    installLayoutTestEnv();
  });

  it("keeps shared link, disabled, and state-button semantics in the vertical list", () => {
    const onClick = jest.fn();
    render(
      <NavigationShell
        items={[
          { key: "intro", text: "소개", Icon, active: true, link: "/developers" },
          {
            key: "docs",
            text: "API 문서",
            Icon,
            link: "/developers/docs",
            linkState: { source: "screen-navigation" },
          },
          { key: "disabled", text: "준비 중", Icon, disabled: true, disabledReason: "아직 제공하지 않습니다." },
          { key: "local", text: "로컬 상태", Icon, onClick },
        ]}
      />,
    );

    const navigation = screen.getByRole("navigation", { name: "화면 탐색" });
    const intro = within(navigation).getByRole("link", { name: "소개" });
    expect(intro.getAttribute("aria-current")).toBe("page");
    expect(intro.className).toContain("bg-v2-inset");
    expect(intro.className).toContain("font-semibold");

    const docs = within(navigation).getByRole("link", { name: "API 문서" });
    fireEvent.click(docs);
    expect(screen.getByTestId("location").textContent).toBe('/developers/docs|{"source":"screen-navigation"}');

    const disabled = within(navigation).getByRole("button", { name: /준비 중/ });
    expect(disabled.hasAttribute("disabled")).toBe(true);
    expect(disabled.getAttribute("title")).toBe("아직 제공하지 않습니다.");

    const local = within(navigation).getByRole("button", { name: "로컬 상태" });
    expect(local.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(local);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("mounts the existing horizontal tabs only while stacked and remeasures them on entry", async () => {
    const items: ScreenTabItem[] = [{ key: "intro", text: "소개", Icon, active: true, link: "/developers" }];
    const { container } = render(<NavigationShell items={items} />);
    const root = container.querySelector("[data-v2-layout]");

    expect(root?.getAttribute("data-stacked")).toBe("false");
    expect(container.querySelector(".v2-tabs")).toBeNull();
    expect(container.querySelector('.v2-toolbar[data-stacked-only="true"]')).not.toBeNull();
    expect(container.querySelector('.v2-toolbar-sentinel[data-stacked-only="true"]')).not.toBeNull();

    setLayoutWidth(390);
    await waitFor(() => expect(container.querySelector(".v2-tabs")).not.toBeNull());
    expect(root?.getAttribute("data-stacked")).toBe("true");
    expect(Element.prototype.scrollTo).toHaveBeenCalled();

    setLayoutWidth(1024);
    await waitFor(() => expect(container.querySelector(".v2-tabs")).toBeNull());
    expect(root?.getAttribute("data-stacked")).toBe("false");
  });

  it("moves focus from the horizontal item to the matching vertical item when expanding", async () => {
    const items: ScreenTabItem[] = [
      { key: "intro", text: "소개", Icon, link: "/developers" },
      { key: "docs", text: "API 문서", Icon, link: "/developers/docs" },
    ];
    const { container } = render(<NavigationShell items={items} />);

    setLayoutWidth(390);
    const horizontalDocs = await waitFor(() => {
      const item = container.querySelector<HTMLElement>('.v2-tabs [data-v2-screen-navigation-item="docs"]');
      expect(item).not.toBeNull();
      return item as HTMLElement;
    });
    horizontalDocs.focus();
    expect(document.activeElement).toBe(horizontalDocs);

    setLayoutWidth(1024);
    await waitFor(() => {
      const desktopDocs = container.querySelector<HTMLElement>('aside [data-v2-screen-navigation-item="docs"]');
      expect(document.activeElement).toBe(desktopDocs);
    });
  });

  it("moves focus from the vertical item to the matching horizontal item when stacking", async () => {
    const items: ScreenTabItem[] = [
      { key: "intro", text: "소개", Icon, link: "/developers" },
      { key: "docs", text: "API 문서", Icon, link: "/developers/docs" },
    ];
    const { container } = render(<NavigationShell items={items} />);
    const desktopDocs = container.querySelector<HTMLElement>('aside [data-v2-screen-navigation-item="docs"]');
    expect(desktopDocs).not.toBeNull();
    desktopDocs?.focus();
    expect(document.activeElement).toBe(desktopDocs);
    const aside = container.querySelector<HTMLElement>("aside");
    if (!aside) {
      throw new Error("Expected the responsive navigation Aside.");
    }
    aside.style.display = "none";
    desktopDocs?.blur();

    setLayoutWidth(390);
    await waitFor(() => {
      const mobileDocs = container.querySelector<HTMLElement>('.v2-tabs [data-v2-screen-navigation-item="docs"]');
      expect(document.activeElement).toBe(mobileDocs);
    });
  });

  it("clears a navigation focus that explicitly blurs to the body", async () => {
    const items: ScreenTabItem[] = [
      { key: "intro", text: "소개", Icon, link: "/developers" },
      { key: "docs", text: "API 문서", Icon, link: "/developers/docs" },
    ];
    const { container } = render(<NavigationShell items={items} />);
    const desktopDocs = container.querySelector<HTMLElement>('aside [data-v2-screen-navigation-item="docs"]');
    desktopDocs?.focus();
    desktopDocs?.blur();
    expect(document.activeElement).toBe(document.body);

    setLayoutWidth(390);
    await waitFor(() => expect(container.querySelector(".v2-tabs")).not.toBeNull());
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves body focus alone after navigation blur and does not autofocus on initial measurement", async () => {
    const items: ScreenTabItem[] = [
      { key: "intro", text: "소개", Icon, link: "/developers" },
      { key: "docs", text: "API 문서", Icon, link: "/developers/docs" },
    ];
    const { container } = render(<NavigationShell items={items} />);
    const input = screen.getByRole("textbox", { name: "본문 입력" });
    const desktopDocs = container.querySelector<HTMLElement>('aside [data-v2-screen-navigation-item="docs"]');

    expect(document.activeElement?.hasAttribute("data-v2-screen-navigation-item")).toBe(false);
    desktopDocs?.focus();
    input.focus();
    expect(document.activeElement).toBe(input);

    setLayoutWidth(390);
    await waitFor(() => expect(container.querySelector(".v2-tabs")).not.toBeNull());
    expect(document.activeElement).toBe(input);
  });
});
