/**
 * @jest-environment jsdom
 */
import "./layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import {
  MobileActionBar,
  PageAside,
  PageHeader,
  PageMain,
  PanelAction,
  PanelSheet,
  V2Page,
  type V2PanelRequest,
} from "~/components/v2/layout";
import { installLayoutTestEnv, setLayoutWidth } from "./layout-test-env";

function Icon() {
  return null;
}

function NavigateButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/elsewhere")}>
      이동
    </button>
  );
}

type HarnessProps = {
  request?: V2PanelRequest | null;
  closeRequest?: number | null;
  onCloseHandled?: () => void;
  withActionBar?: boolean;
};

function Harness({ request = null, closeRequest = null, onCloseHandled, withActionBar = false }: HarnessProps) {
  return (
    <V2Page
      width="wide"
      panelRequest={request}
      panelCloseRequest={closeRequest}
      onPanelCloseRequestHandled={onCloseHandled}
    >
      <PageHeader title="미래시" />
      <PageMain>
        <button type="button">본문 버튼</button>
        <NavigateButton />
      </PageMain>
      <PageAside>
        <PanelSheet panelId="filter" title="컨텐츠 필터" Icon={Icon} headerAction={<button type="button">초기화</button>}>
          <label>
            <input type="checkbox" /> 이벤트
          </label>
        </PanelSheet>
        <PanelSheet panelId="display" title="표시 설정" Icon={Icon} collapsible>
          <span>표시 설정 본문</span>
        </PanelSheet>
      </PageAside>
      {withActionBar ? <MobileActionBar panels={[{ panelId: "filter", title: "필터", Icon }]} /> : null}
    </V2Page>
  );
}

function renderHarness(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// A non-collapsible panel whose header action can appear and disappear, like the 초기화 action after a filter change.
function HeaderActionHarness({ withAction }: { withAction: boolean }) {
  return (
    <V2Page width="wide">
      <PageHeader title="미래시" />
      <PageMain>본문</PageMain>
      <PageAside>
        <PanelSheet
          panelId="filter"
          title="컨텐츠 필터"
          Icon={Icon}
          headerAction={
            withAction ? (
              <PanelAction variant="danger" onClick={() => {}}>
                초기화
              </PanelAction>
            ) : null
          }
        >
          <span>필터 본문</span>
        </PanelSheet>
      </PageAside>
    </V2Page>
  );
}

describe("PanelSheet", () => {
  beforeEach(() => {
    installLayoutTestEnv();
    setLayoutWidth(1024);
  });

  it("starts a collapsible panel collapsed and toggles its body with aria-expanded", () => {
    renderHarness(<Harness />);
    const toggle = screen.getByRole("button", { name: "표시 설정" });

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("표시 설정 본문")).toBeNull();

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("표시 설정 본문")).toBeTruthy();
  });

  it("keeps the collapsed body mounted until the close animation ends", () => {
    renderHarness(<Harness />);
    const toggle = screen.getByRole("button", { name: "표시 설정" });
    fireEvent.click(toggle);
    const body = screen.getByText("표시 설정 본문").parentElement as HTMLElement;

    fireEvent.click(toggle);
    expect(body.isConnected).toBe(true);
    expect(body.className).toContain("v2-panel-exit");

    fireEvent.animationEnd(body);
    expect(screen.queryByText("표시 설정 본문")).toBeNull();
  });

  it("renders the body in the Aside on side-by-side and opens no sheet for a request", () => {
    renderHarness(<Harness request={{ panelId: "filter", requestId: 1 }} />);

    expect(screen.getByText("이벤트")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the sheet for a program request on stacked and focuses its title", async () => {
    setLayoutWidth(390);
    renderHarness(<Harness request={{ panelId: "filter", requestId: 1 }} />);

    expect(await screen.findByRole("dialog", { name: "컨텐츠 필터" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.textContent).toBe("컨텐츠 필터"));
  });

  it("keeps one body instance while the stacked sheet is open", async () => {
    setLayoutWidth(390);
    renderHarness(<Harness request={{ panelId: "filter", requestId: 1 }} />);

    await screen.findByRole("dialog", { name: "컨텐츠 필터" });

    expect(screen.getAllByText("이벤트")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "컨텐츠 필터" }).textContent).toContain("이벤트");
  });

  it("returns focus to the action bar trigger after the close button", async () => {
    setLayoutWidth(390);
    renderHarness(<Harness withActionBar />);
    const trigger = screen.getByRole("button", { name: "필터" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "컨텐츠 필터" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("does not return focus to the trigger when a location change closes the sheet", async () => {
    setLayoutWidth(390);
    renderHarness(<Harness withActionBar />);
    const trigger = screen.getByRole("button", { name: "필터" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "컨텐츠 필터" });

    fireEvent.click(screen.getByRole("button", { name: "이동" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).not.toBe(trigger));
  });

  it("closes the sheet with Escape", async () => {
    setLayoutWidth(390);
    renderHarness(<Harness request={{ panelId: "filter", requestId: 1 }} />);
    const dialog = await screen.findByRole("dialog", { name: "컨텐츠 필터" });

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes the sheet on a program close request and reports completion once", async () => {
    setLayoutWidth(390);
    const onCloseHandled = jest.fn<() => void>();
    const { rerender } = renderHarness(
      <Harness request={{ panelId: "filter", requestId: 1 }} onCloseHandled={onCloseHandled} />,
    );
    await screen.findByRole("dialog", { name: "컨텐츠 필터" });

    rerender(
      <MemoryRouter>
        <Harness request={{ panelId: "filter", requestId: 1 }} closeRequest={1} onCloseHandled={onCloseHandled} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onCloseHandled).toHaveBeenCalledTimes(1);
  });

  it("closes the sheet when the location changes", async () => {
    setLayoutWidth(390);
    renderHarness(<Harness request={{ panelId: "filter", requestId: 1 }} />);
    await screen.findByRole("dialog", { name: "컨텐츠 필터" });

    fireEvent.click(screen.getByRole("button", { name: "이동" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes an open sheet when the layout switches to side-by-side", async () => {
    setLayoutWidth(390);
    renderHarness(<Harness request={{ panelId: "filter", requestId: 1 }} />);
    await screen.findByRole("dialog", { name: "컨텐츠 필터" });

    act(() => setLayoutWidth(1024));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("expands and highlights the Aside panel for a desktop request without opening a sheet or moving focus", async () => {
    const { rerender } = renderHarness(<Harness />);
    const outside = screen.getByRole("button", { name: "본문 버튼" });
    outside.focus();
    expect(screen.getByRole("button", { name: "표시 설정" }).getAttribute("aria-expanded")).toBe("false");

    rerender(
      <MemoryRouter>
        <Harness request={{ panelId: "display", requestId: 1 }} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "표시 설정" }).getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".v2-panel-highlight")).not.toBeNull();
    expect(document.activeElement).toBe(outside);
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it("keeps the header row class and height box identical when a header action appears or disappears", () => {
    setLayoutWidth(1024);
    const { container, rerender } = renderHarness(<HeaderActionHarness withAction={false} />);
    const headerRow = () => container.querySelector<HTMLElement>('[data-v2-panel="filter"] > div') as HTMLElement;
    const withoutAction = headerRow().className;
    expect(withoutAction).toContain("items-start");
    expect(withoutAction).not.toContain("min-h-v2-row-min");
    expect(headerRow().children).toHaveLength(1);

    rerender(
      <MemoryRouter>
        <HeaderActionHarness withAction />
      </MemoryRouter>,
    );

    expect(headerRow().className).toBe(withoutAction);
    const actionBox = headerRow().lastElementChild as HTMLElement;
    expect(actionBox.className).toContain("flex h-5 shrink-0 items-center");
    expect(actionBox.querySelector("button")?.textContent).toBe("초기화");

    rerender(
      <MemoryRouter>
        <HeaderActionHarness withAction={false} />
      </MemoryRouter>,
    );

    expect(headerRow().className).toBe(withoutAction);
    expect(headerRow().children).toHaveLength(1);
  });

  it("ignores a program request for a disabled panel", () => {
    function DisabledHarness() {
      return (
        <V2Page width="wide" panelRequest={{ panelId: "off", requestId: 1 }}>
          <PageHeader title="미래시" />
          <PageMain>본문</PageMain>
          <PageAside>
            <PanelSheet panelId="off" title="꺼진 패널" Icon={Icon} collapsible disabled>
              <span>꺼진 본문</span>
            </PanelSheet>
          </PageAside>
        </V2Page>
      );
    }
    renderHarness(<DisabledHarness />);

    expect(screen.queryByText("꺼진 본문")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not expand or highlight a disabled panel on a desktop request", () => {
    renderHarness(
      <V2Page width="wide" panelRequest={{ panelId: "off", requestId: 1 }}>
        <PageHeader title="미래시" />
        <PageMain>본문</PageMain>
        <PageAside>
          <PanelSheet panelId="off" title="꺼진 패널" Icon={Icon} collapsible disabled>
            <span>꺼진 본문</span>
          </PanelSheet>
        </PageAside>
      </V2Page>,
    );

    expect(screen.queryByText("꺼진 본문")).toBeNull();
    expect(document.querySelector('[data-v2-panel="off"] .v2-panel-highlight')).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("never opens the stacked sheet for a disabled panel's program request, and its action bar trigger is disabled", () => {
    setLayoutWidth(390);
    renderHarness(
      <V2Page width="wide" panelRequest={{ panelId: "off", requestId: 1 }}>
        <PageHeader title="미래시" />
        <PageMain>본문</PageMain>
        <MobileActionBar panels={[{ panelId: "off", title: "꺼진 패널", Icon, disabled: true }]} />
        <PageAside>
          <PanelSheet panelId="off" title="꺼진 패널" Icon={Icon} collapsible disabled>
            <span>꺼진 본문</span>
          </PanelSheet>
        </PageAside>
      </V2Page>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("꺼진 본문")).toBeNull();
    const trigger = screen.getByRole("button", { name: "꺼진 패널" });
    expect(trigger.hasAttribute("disabled")).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
