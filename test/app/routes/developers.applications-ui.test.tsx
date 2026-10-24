/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRoutesStub, Outlet } from "react-router";
import { V2Page } from "~/components/v2/layout/V2Page";
import { TimeZoneProvider } from "~/contexts/TimeZoneProvider";

jest.mock("~/routes/developers._components/requireOAuthAppManager", () => ({
  requireOAuthAppManager: jest.fn(),
}));

import DeveloperApplications from "~/routes/developers.applications._index";
import DeveloperApplicationDetail from "~/routes/developers.applications.$uid";
import NewDeveloperApplication from "~/routes/developers.applications.new";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";

const application = {
  uid: "app-uid",
  name: "Roster Tool",
  clientId: "mllg_oc_0123456789abcdef0123456789abcdef",
  redirectUris: ["https://tool.example/callback"],
  scopes: ["profile" as const],
  updatedAt: "2026-10-21T00:00:00.000Z",
  clientSecretIssuedAt: "2026-10-20T00:00:00.000Z",
};

function DeveloperShell() {
  return (
    <V2Page width="wide">
      <Outlet />
    </V2Page>
  );
}

function renderApplicationsList(
  applications = [
    { uid: "one", name: "Roster Tool", scopes: ["profile"] },
    { uid: "two", name: "Student Viewer", scopes: ["students:read"] },
  ],
) {
  const RoutesStub = createRoutesStub([
    {
      id: "developers",
      path: "/developers",
      Component: DeveloperShell,
      children: [
        {
          id: "applications",
          path: "applications",
          loader: () => ({ applications, loadError: false }),
          Component: DeveloperApplications,
        },
      ],
    },
  ]);
  return render(
    <RoutesStub
      initialEntries={["/developers/applications"]}
      hydrationData={{
        loaderData: {
          applications: {
            applications,
            loadError: false,
          },
        },
      }}
    />,
  );
}

function renderNewApplication(
  actionData?: unknown,
  existingApplications: { uid: string; name: string; scopes: string[] }[] = [],
) {
  const RoutesStub = createRoutesStub([
    {
      id: "developers",
      path: "/developers",
      Component: DeveloperShell,
      children: [
        {
          id: "new-application",
          path: "applications/new",
          loader: () => ({ applications: existingApplications, loadError: false }),
          Component: NewDeveloperApplication,
        },
      ],
    },
  ]);
  return render(
    <RoutesStub
      initialEntries={["/developers/applications/new"]}
      hydrationData={{
        loaderData: { "new-application": { applications: existingApplications, loadError: false } },
        ...(actionData ? { actionData: { "new-application": actionData } } : {}),
      }}
    />,
  );
}

function renderApplicationDetail(actionData?: unknown, timeZone = "UTC") {
  const RoutesStub = createRoutesStub([
    {
      id: "developers",
      path: "/developers",
      Component: DeveloperShell,
      children: [
        {
          id: "application-detail",
          path: "applications/:uid",
          loader: () => ({ application }),
          Component: DeveloperApplicationDetail,
        },
      ],
    },
  ]);
  const hydrationData = {
    loaderData: { "application-detail": { application } },
    ...(actionData ? { actionData: { "application-detail": actionData } } : {}),
  };
  return render(
    <TimeZoneProvider timeZone={timeZone}>
      <RoutesStub initialEntries={["/developers/applications/app-uid"]} hydrationData={hydrationData} />
    </TimeZoneProvider>,
  );
}

beforeEach(() => {
  installLayoutTestEnv();
});

describe("developer application screens", () => {
  it("renders compact application rows without dividers or bold names", () => {
    renderApplicationsList();
    const list = screen.getByRole("navigation", { name: "내 애플리케이션" }).querySelector("ul");
    const row = screen.getByRole("link", { name: /Roster Tool/ });

    expect(list?.className).not.toContain("divide-y");
    expect(within(row).getByText("Roster Tool").className).not.toContain("font-semibold");
  });

  it("sizes the empty application state by its content and padding", () => {
    renderApplicationsList([]);

    const emptyState = screen.getByRole("heading", { name: "애플리케이션이 없어요" }).parentElement;
    expect(emptyState?.className).not.toContain("min-h-48");
    expect(emptyState?.className).toContain("py-8");
  });

  it("allows typing into the new application Redirect URI input", () => {
    renderNewApplication();
    const input = screen.getByLabelText("Redirect URI 1") as HTMLInputElement;
    const addButton = screen.getByRole("button", { name: "주소 추가" });

    fireEvent.change(input, { target: { value: "https://tool.example/updated" } });

    expect(input.value).toBe("https://tool.example/updated");
    expect(addButton.className).toContain("px-0");
    expect(addButton.className).not.toContain("px-3");
  });

  it("paints each application permission cell background instead of the row", () => {
    renderNewApplication();

    const rows = screen.getByRole("table").querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);

    rows.forEach((row) => {
      expect(row.classList.contains("bg-v2-inset")).toBe(false);
      const cells = row.querySelectorAll("th, td");
      expect(cells).toHaveLength(3);
      cells.forEach((cell) => expect(cell.classList.contains("bg-v2-inset")).toBe(true));
    });
  });

  it("keeps the applications header and list around the created credentials card", () => {
    renderNewApplication(
      {
        ok: true,
        uid: "created-app",
        name: "New Tool",
        clientId: "mllg_oc_created",
        clientSecret: "mllg_os_created",
        scopes: ["profile"],
      },
      [{ uid: "existing-app", name: "Existing Tool", scopes: ["students:read"] }],
    );

    expect(screen.getByRole("heading", { name: "애플리케이션", level: 2 })).toBeTruthy();
    expect(screen.getByRole("button", { name: "새 애플리케이션" }).hasAttribute("disabled")).toBe(true);
    const createdCard = screen.getByRole("region", { name: "애플리케이션을 만들었어요" });
    expect(within(createdCard).getByRole("heading", { name: "애플리케이션을 만들었어요", level: 3 })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "내 애플리케이션" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Existing Tool/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /New Tool/ })).toBeTruthy();

    for (const label of ["Client ID", "Client Secret"]) {
      const field = within(createdCard).getByLabelText(label) as HTMLInputElement;
      expect(field.className).toContain("bg-v2-surface");
      expect(field.className).toContain("font-mono");
      expect(within(createdCard).getByRole("button", { name: `${label} 복사하기` }).className).toContain("bg-v2-inset");
    }
  });

  it("allows typing into the application detail Redirect URI input", () => {
    renderApplicationDetail();
    const input = screen.getByLabelText("Redirect URI 1") as HTMLInputElement;
    const addButton = screen.getByRole("button", { name: "주소 추가" });

    fireEvent.change(input, { target: { value: "https://tool.example/updated" } });

    expect(input.value).toBe("https://tool.example/updated");
    expect(addButton.className).toContain("px-0");
    expect(addButton.className).not.toContain("px-3");
  });

  it("shows a regenerated secret in place of the issued date and regenerate button", () => {
    renderApplicationDetail({
      ok: true,
      intent: "rotate",
      clientSecret: "mllg_os_revealed-once",
      issuedAt: "2026-10-22T00:00:00.000Z",
    });

    expect((screen.getByLabelText("Client Secret") as HTMLInputElement).value).toBe("mllg_os_revealed-once");
    expect(screen.getByText("지금만 확인할 수 있어요.")).toBeTruthy();
    expect(screen.queryByText("2026/10/22 발급")).toBeNull();
    expect(screen.queryByRole("button", { name: "재발급" })).toBeNull();
    expect((screen.getByLabelText("Client Secret") as HTMLInputElement).className).toContain("bg-v2-surface");
    expect(screen.getByRole("button", { name: "Client Secret 복사하기" }).className).toContain("bg-v2-inset");
  });

  it("formats the client secret issue date in the display time zone", () => {
    renderApplicationDetail(undefined, "America/Los_Angeles");

    expect(screen.getByText("2026/10/19 발급")).toBeTruthy();
  });
});
