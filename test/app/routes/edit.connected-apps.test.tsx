/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub, Outlet } from "react-router";
import { V2Page } from "~/components/v2/layout/V2Page";
import { TimeZoneProvider } from "~/contexts/TimeZoneProvider";

if (typeof globalThis.Response === "undefined") {
  class TestResponse {
    readonly status: number;
    readonly headers: Headers;

    constructor(_body: unknown = null, init: ResponseInit = {}) {
      this.status = init.status ?? 200;
      this.headers = new Headers(init.headers);
    }
  }
  Object.defineProperty(globalThis, "Response", { value: TestResponse as unknown as typeof Response });
}

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/models/mollulog-oauth", () => ({
  disconnectOAuthGrant: jest.fn(),
  getOAuthConnections: jest.fn(),
}));

import { getActiveSensei } from "~/auth/authenticator.server";
import { disconnectOAuthGrant, getOAuthConnections } from "~/models/mollulog-oauth";
import ConnectedApps, { action, loader } from "~/routes/edit.connected-apps";

function AccountShell() {
  return (
    <V2Page width="wide">
      <Outlet />
    </V2Page>
  );
}

const connection: {
  id: number;
  applicationUid: string;
  applicationName: string;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
} = {
  id: 7,
  applicationUid: "app-uid",
  applicationName: "Roster Tool",
  scopes: ["profile", "students:read", "students:write"],
  connectedAt: "2026-10-20T00:00:00.000Z",
  lastUsedAt: "2026-10-21T12:30:00.000Z",
};
const modelConnection = {
  ...connection,
  connectedAt: new Date(connection.connectedAt),
  lastUsedAt: new Date(connection.lastUsedAt!),
};

function renderPage(loaderData: { connections: typeof connection[]; loadError: boolean }, timeZone = "UTC") {
  const RoutesStub = createRoutesStub([
    {
      id: "edit",
      path: "/edit",
      Component: AccountShell,
      children: [
        {
          id: "connected-apps",
          path: "connected-apps",
          loader: () => loaderData,
          Component: ConnectedApps,
        },
      ],
    },
  ]);
  return render(
    <TimeZoneProvider timeZone={timeZone}>
      <RoutesStub
        initialEntries={["/edit/connected-apps"]}
        hydrationData={{ loaderData: { "connected-apps": loaderData } }}
      />
    </TimeZoneProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getOAuthConnections).mockResolvedValue([connection] as never);
});

describe("connected applications screen", () => {
  it("shows granted permissions and dates, then focuses the inline disconnect confirmation", async () => {
    renderPage({ connections: [connection], loadError: false });

    expect(screen.getByRole("heading", { name: "연결된 애플리케이션" })).toBeTruthy();
    expect(screen.getByText("프로필 보기 · 모집 학생 보기·변경")).toBeTruthy();
    expect(screen.getByText("2026/10/20 연결 · 마지막 사용 2026/10/21")).toBeTruthy();

    const trigger = screen.getByRole("button", { name: "Roster Tool 연결 해제" });
    const row = trigger.closest("li");
    expect(row?.className).not.toContain("rounded-lg");
    expect(row?.parentElement?.className).toContain("rounded-lg");
    expect(row?.parentElement?.className).not.toContain("divide-y");
    expect(trigger.className).toContain("min-h-7");
    expect(trigger.className).not.toContain("w-full");
    fireEvent.click(trigger);
    expect(screen.getByText("Roster Tool에서 내 데이터에 더 이상 접근할 수 없어요.")).toBeTruthy();
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(document.activeElement?.tagName).toBe("FIELDSET"));

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("shows the specified empty state", () => {
    renderPage({ connections: [], loadError: false });
    expect(screen.getByRole("heading", { name: "연결된 애플리케이션이 없어요" })).toBeTruthy();
    const emptyState = screen.getByRole("heading", { name: "연결된 애플리케이션이 없어요" }).parentElement;
    expect(emptyState?.className).not.toContain("min-h-48");
    expect(emptyState?.className).toContain("py-8");
  });

  it("omits the last-use prefix for connections that have not been used", () => {
    renderPage({ connections: [{ ...connection, lastUsedAt: null }], loadError: false });
    expect(screen.getByText("2026/10/20 연결 · 아직 사용하지 않음")).toBeTruthy();
  });

  it("formats connection timestamps in the display time zone", () => {
    renderPage({ connections: [connection], loadError: false }, "America/Los_Angeles");

    expect(screen.getByText("2026/10/19 연결 · 마지막 사용 2026/10/21")).toBeTruthy();
  });

  it("loads connections for the active account", async () => {
    jest.mocked(getActiveSensei).mockResolvedValue({ id: 42 } as never);
    jest.mocked(getOAuthConnections).mockResolvedValue([modelConnection] as never);
    const result = await loader({
      request: new Request("https://mollulog.net/edit/connected-apps"),
      context: { cloudflare: { env: { POSTGRES_URL: "postgres://local" }, ctx: "ctx" } },
    } as never);

    expect(getOAuthConnections).toHaveBeenCalledWith(
      { POSTGRES_URL: "postgres://local" } as never,
      42,
      { ctx: "ctx" } as never,
    );
    expect(result).toMatchObject({ data: { loadError: false, connections: [{ connectedAt: connection.connectedAt }] } });
  });

  it("checks ownership through the model before disconnecting a submitted grant", async () => {
    jest.mocked(getActiveSensei).mockResolvedValue({ id: 42 } as never);
    jest.mocked(disconnectOAuthGrant).mockResolvedValue(true);
    const form = new FormData();
    form.set("intent", "disconnect");
    form.set("grantId", "7");
    const result = await action({
      request: {
        url: "https://mollulog.net/edit/connected-apps",
        headers: new Headers(),
        formData: async () => form,
      } as unknown as Request,
      context: { cloudflare: { env: { POSTGRES_URL: "postgres://local" }, ctx: "ctx" } },
    } as never);

    expect(disconnectOAuthGrant).toHaveBeenCalledWith({ POSTGRES_URL: "postgres://local" } as never, 42, 7, { ctx: "ctx" } as never);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("Location")).toBe("/edit/connected-apps");
  });
});
