/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import NotificationHistoryPopover from "~/components/v2/layout/navigation/NotificationHistoryPopover";

jest.mock("react-router", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return {
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode } & Record<string, unknown>) =>
      createElement("a", { href: to, ...props }, children),
    MemoryRouter: ({ children }: { children: React.ReactNode }) => children,
    useLocation: () => ({ pathname: "/", search: "", hash: "" }),
  };
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "fetch");
});

function renderNotifications() {
  return render(
    <MemoryRouter>
      <NotificationHistoryPopover placement="desktop" unreadCount={1} isOpen />
    </MemoryRouter>,
  );
}

function notificationResponse(snapshotMaxDeliveredAt: string | null = null) {
  return {
    ok: true,
    json: async () => ({
      snapshotMaxDeliveredAt,
      notifications: [
        {
          uid: "notification-1",
          typeLabel: "제안/문의 답변",
          relativeTime: "방금",
          deliveredAt: "2026-08-01T00:00:00.000Z",
          message: { state: "available", text: "새 답변이 등록되었어요." },
          action: { state: "available", label: "답변 보기", to: "/contact/1" },
          isUnread: true,
        },
      ],
    }),
  } as Response;
}

function mockFetch() {
  const fetchMock = jest.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: fetchMock });
  return fetchMock;
}

describe("notification history states", () => {
  it("shows skeleton content while the list is loading", () => {
    mockFetch().mockImplementation(() => new Promise<Response>(() => undefined));

    renderNotifications();

    expect(screen.getByRole("status", { name: "알림 불러오는 중" })).toBeTruthy();
  });

  it("shows a retry action after load failure and renders the empty state after retry", async () => {
    mockFetch()
      .mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ snapshotMaxDeliveredAt: null, notifications: [] }),
      } as Response);
    renderNotifications();

    expect(await screen.findByText("알림을 불러오지 못했어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("도착한 알림이 없어요")).toBeTruthy();
  });

  it("shows the required warning when marking the loaded snapshot as read fails", async () => {
    mockFetch()
      .mockResolvedValueOnce(notificationResponse("2026-08-01T00:00:00.000Z"))
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "internal details are not shown" }),
      } as Response);
    renderNotifications();

    expect(await screen.findByText("답변 보기")).toBeTruthy();
    expect(await screen.findByText("읽음 처리하지 못했어요")).toBeTruthy();
    expect(screen.queryByText("internal details are not shown")).toBeNull();
  });
});
