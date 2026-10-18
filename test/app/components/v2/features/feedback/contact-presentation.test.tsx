/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "../../layout/layout-test-polyfills";
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from "react-router";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { ContactForm } from "~/components/v2/features/feedback/ContactForm";
import { ContactHistoryPanel } from "~/components/v2/features/feedback/ContactHistoryPanel";
import { ContactRouteError } from "~/components/v2/features/feedback/ContactRouteError";
import { ContactThread } from "~/components/v2/features/feedback/ContactThread";
import { MobileActionBar, PageAside, PageHeader, PageMain, PanelSheet, V2Page } from "~/components/v2/layout";
import type { FeedbackReply, FeedbackTicket } from "~/models/feedback";
import { installLayoutTestEnv, setLayoutWidth } from "../../layout/layout-test-env";

function makeTicket(overrides: Partial<FeedbackTicket> = {}): FeedbackTicket {
  return {
    id: 1,
    uid: "ticket-1",
    userId: 10,
    title: "문의 제목",
    content: "문의 내용",
    status: "waiting",
    replyEmail: null,
    lastSeenAdminReplyId: 0,
    createdAt: "2026-10-02T01:03:00.000Z",
    updatedAt: "2026-10-18T01:03:00.000Z",
    ...overrides,
  };
}

function makeReply(overrides: Partial<FeedbackReply> = {}): FeedbackReply {
  return {
    id: 1,
    uid: "reply-1",
    ticketId: 1,
    userId: 11,
    isAdmin: true,
    content: "답변 내용",
    createdAt: "2026-10-03T01:03:00.000Z",
    ...overrides,
  };
}

function ContactHistoryNavigationHarness({ tickets }: { tickets: FeedbackTicket[] }) {
  const { pathname } = useLocation();
  const selectedTicket = tickets.find((ticket) => `/contact/${ticket.uid}` === pathname);

  if (selectedTicket) {
    return (
      <V2Page width="reading">
        <PageHeader back={{ title: "제안/문의", to: "/contact" }} title={selectedTicket.title} />
        <PageMain>문의 상세</PageMain>
      </V2Page>
    );
  }

  return (
    <V2Page width="reading">
      <PageHeader title="제안/문의" />
      <PageMain>새 문의 작성</PageMain>
      <PageAside>
        <PanelSheet panelId="contact-history" title="내 문의 내역" Icon={ChatBubbleLeftRightIcon}>
          <ContactHistoryPanel tickets={tickets} />
        </PanelSheet>
      </PageAside>
      <MobileActionBar
        panels={[
          {
            panelId: "contact-history",
            title: "내 문의 내역",
            shortTitle: "내 문의",
            Icon: ChatBubbleLeftRightIcon,
          },
        ]}
      />
    </V2Page>
  );
}

function getHistoryScrollContainer(dialog: HTMLElement) {
  const link = within(dialog).getByRole("link", { name: /문의 24/ });
  return link.closest("ul")?.parentElement as HTMLElement;
}

describe("contact presentation", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("disables the create action while submission is in progress", () => {
    const router = createMemoryRouter(
      [{ path: "/", element: <ContactForm submitting /> }],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);

    expect(screen.getByRole("button", { name: "제출 중..." })).toHaveProperty("disabled", true);
  });

  it("renders an unexpected route error without exposing the internal message", async () => {
    installLayoutTestEnv();
    const responseDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Response");
    Object.defineProperty(globalThis, "Response", {
      configurable: true,
      value: class ResponseStub {},
    });
    const router = createMemoryRouter(
      [
        {
          path: "/contact",
          Component: () => <p>unreachable contact screen</p>,
          ErrorBoundary: ContactRouteError,
          HydrateFallback: () => null,
          loader: () => {
            throw new Error("PostgreSQL host=db.internal password=secret");
          },
        },
      ],
      { initialEntries: ["/contact"] },
    );
    const view = render(<RouterProvider router={router} />);

    try {
      expect(await screen.findByRole("heading", { name: "알 수 없는 오류가 발생했어요" })).toBeTruthy();
      expect(screen.getByText("잠시 후 다시 시도해주세요.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "새로고침" })).toBeTruthy();
      expect(screen.queryByText(/PostgreSQL host=db\.internal password=secret/)).toBeNull();
    } finally {
      view.unmount();
      if (responseDescriptor) {
        Object.defineProperty(globalThis, "Response", responseDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "Response");
      }
    }
  });

  it("shows created dates and text labels for every ticket status", () => {
    render(
      <MemoryRouter>
        <ContactHistoryPanel
          tickets={[
            makeTicket({ status: "waiting" }),
            makeTicket({ id: 2, uid: "ticket-2", status: "in_progress" }),
            makeTicket({ id: 3, uid: "ticket-3", status: "resolved" }),
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("2026/10/02")).toHaveLength(3);
    expect(screen.queryByText("2026/10/18")).toBeNull();
    expect(screen.getByText("답변대기")).toBeTruthy();
    expect(screen.getByText("처리중")).toBeTruthy();
    const resolvedStatus = screen.getByText("답변완료").parentElement;
    expect(resolvedStatus?.className).toContain("text-v2-success");
  });

  it("keeps the empty history message independent of the form location", () => {
    render(
      <MemoryRouter>
        <ContactHistoryPanel tickets={[]} />
      </MemoryRouter>,
    );

    expect(screen.getByText("등록된 문의가 아직 없어요.")).toBeTruthy();
    expect(screen.queryByText(/아래 폼/)).toBeNull();
  });

  it("preserves visible history scroll through sheet reopen and detail navigation", async () => {
    installLayoutTestEnv();
    setLayoutWidth(390);
    const tickets = Array.from({ length: 24 }, (_, index) =>
      makeTicket({ id: index + 1, uid: `ticket-${index + 1}`, title: `문의 ${index + 1}` }),
    );
    render(
      <MemoryRouter initialEntries={["/contact"]}>
        <ContactHistoryNavigationHarness tickets={tickets} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "내 문의" }));
    let dialog = await screen.findByRole("dialog", { name: "내 문의 내역" });
    let history = getHistoryScrollContainer(dialog);
    history.scrollTop = 360;
    fireEvent.scroll(history);

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "내 문의 내역" })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "내 문의" }));
    dialog = await screen.findByRole("dialog", { name: "내 문의 내역" });
    expect(getHistoryScrollContainer(dialog).scrollTop).toBe(360);

    fireEvent.click(within(dialog).getByRole("link", { name: /문의 24/ }));
    expect(await screen.findByRole("heading", { name: "문의 24" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "제안/문의" }));
    await screen.findByRole("button", { name: "내 문의" });

    fireEvent.click(screen.getByRole("button", { name: "내 문의" }));
    dialog = await screen.findByRole("dialog", { name: "내 문의 내역" });
    history = getHistoryScrollContainer(dialog);

    expect(history.scrollTop).toBe(360);
  });

  it("keeps action-returned draft values and associates each validation error with its field", () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <ContactForm
              errors={{ title: "제목을 입력해주세요.", content: "내용을 입력해주세요." }}
              values={{ title: "  임시 제목  ", content: "본문 초안" }}
            />
          ),
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);

    const title = screen.getByLabelText("제목");
    const content = screen.getByLabelText("내용");
    expect(title).toHaveProperty("value", "  임시 제목  ");
    expect(content).toHaveProperty("value", "본문 초안");
    expect(title.getAttribute("aria-describedby")).toBe("contact-title-error");
    expect(content.getAttribute("aria-describedby")).toContain("contact-content-error");
    expect(screen.getByText("제목을 입력해주세요.").getAttribute("role")).toBe("alert");
    expect(screen.getByText("내용을 입력해주세요.").getAttribute("role")).toBe("alert");
  });

  it("distinguishes an empty reply thread from an in-progress ticket", () => {
    render(
      <ContactThread ticket={makeTicket({ status: "in_progress" })} replies={[]} />,
    );

    expect(screen.getByText("아직 등록된 답글이 없어요.")).toBeTruthy();
    expect(screen.getByText("문의를 확인 후 처리중이에요. 조금만 기다려주세요.")).toBeTruthy();
  });

  it("places replies on opposite sides according to their author", () => {
    const { container } = render(
      <ContactThread
        ticket={makeTicket()}
        replies={[
          makeReply({ uid: "admin", isAdmin: true, content: "처리 결과를 안내드립니다." }),
          makeReply({ id: 2, uid: "user", isAdmin: false, content: "내 추가 문의" }),
        ]}
      />,
    );

    expect(screen.getByText("처리 결과를 안내드립니다.").closest("li")?.className).toContain("justify-start");
    expect(screen.getByText("내 추가 문의").closest("li")?.className).toContain("justify-end");
    expect(container.querySelectorAll("time")).toHaveLength(2);
  });
});
