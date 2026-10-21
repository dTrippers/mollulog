/** @jest-environment jsdom */
import "../components/v2/layout/layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fireEvent, render, screen } from "@testing-library/react";
import { defaultStudentDirectoryFilterState, type StudentDirectoryFilterState, type StudentDirectoryPersonalState } from "~/domain/student-directory";
import { Attack, Defense } from "~/graphql/graphql";
import type { StudentDirectoryStudent } from "~/models/student-directory";

const mockUseLoaderData = jest.fn<() => {
  students: StudentDirectoryStudent[];
  listStatus: "loaded" | "failed";
  filterState: StudentDirectoryFilterState;
  personalState: StudentDirectoryPersonalState;
}>();
const mockUseLocation = jest.fn();
const mockUseOutletContext = jest.fn();
const mockShowSignIn = jest.fn();
const mockSetFilterState = jest.fn();
jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/models/student-directory", () => ({ getStudentDirectoryStudents: jest.fn() }));
jest.mock("~/views/student-directory", () => ({ loadStudentDirectoryPersonalState: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: () => ({ error: jest.fn() }), captureServerError: jest.fn() }));
jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    Outlet: () => "outlet",
    useLoaderData: () => mockUseLoaderData(),
    useLocation: () => mockUseLocation(),
    useOutletContext: () => mockUseOutletContext(),
  };
});
jest.mock("~/contexts/SignInProvider", () => ({ useSignIn: () => ({ showSignIn: mockShowSignIn }) }));
jest.mock("~/routes/students._components/use-student-directory-filter-state", () => ({
  useStudentDirectoryFilterState: () => [mockUseLoaderData().filterState, mockSetFilterState],
}));
jest.mock("~/components/v2/features/students/DirectoryFilterPanel", () => ({
  DirectoryFilterPanel: () => jest.requireActual<typeof import("react")>("react").createElement("div", { "data-filter-panel": true, "data-testid": "filter-panel-body" }),
}));
jest.mock("~/components/v2/primitives/Select", () => ({
  Select: ({ label }: { label: string }) => jest.requireActual<typeof import("react")>("react").createElement("select", { "aria-label": label }),
}));
jest.mock("~/components/v2/layout", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    V2Page: ({ width, children }: { width: string; children: React.ReactNode }) => React.createElement("div", { "data-v2-width": width }, children),
    PageHeader: ({ title }: { title: string }) => React.createElement("h1", null, title),
    PageAside: ({ children }: { children: React.ReactNode }) => React.createElement("aside", null, children),
    PanelSheet: function PanelSheetMock({ panelId, title, description, sheetDescription, collapsible, disabled, children }: { panelId: string; title: string; description?: string; sheetDescription?: string; collapsible?: boolean; disabled?: boolean; children: React.ReactNode }) {
      const [expanded, setExpanded] = React.useState(() => !disabled && !collapsible);
      return React.createElement(
        "section",
        { "data-panel": panelId, "data-collapsible": Boolean(collapsible), "data-disabled": Boolean(disabled), "data-description": description ?? "", "data-sheet-description": sheetDescription ?? "" },
        React.createElement("h2", null, title),
        description ? React.createElement("span", null, description) : null,
        sheetDescription ? React.createElement("span", null, sheetDescription) : null,
        collapsible && !disabled
          ? React.createElement("button", { type: "button", "aria-expanded": expanded, onClick: () => setExpanded((value) => !value) }, title)
          : null,
        !disabled && expanded ? children : null,
      );
    },
    AsideLinks: ({ items }: { items: { title: string; description?: string }[] }) =>
      React.createElement("ul", { "data-aside-links": true }, items.map((item) => React.createElement("li", { key: item.title }, `${item.title}${item.description ? ` ${item.description}` : ""}`))),
    MobileActionBar: ({ links, panels }: { links: { title: string }[]; panels: { title: string }[] }) =>
      React.createElement("nav", { "data-mobile-action-bar": true }, [...links, ...panels].map((item, index) => React.createElement("span", { key: `${item.title}-${index}` }, item.title))),
  };
});

import { useLocation, useLoaderData, useOutletContext } from "react-router";
import StudentsLayout from "~/routes/students";

const baseStudent: StudentDirectoryStudent = {
  uid: "student-a", name: "학생", familyName: null, altNames: [], school: "millennium", initialTier: 3,
  order: 1, releaseAt: "2025-01-01T00:00:00.000Z", attackType: Attack.Explosive, defenseType: Defense.Light, weaponType: "ar",
  acquisitionType: "regular", canUseCover: true, skillEffectTags: [], club: null, studentVariant: null, position: "front",
  tacticRole: "attacker", birthday: "2000-01-01", role: "striker", equipments: ["hat", "bag", "shoes"], released: true, catalog: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLoaderData.mockReturnValue({
    students: [baseStudent],
    listStatus: "loaded",
    filterState: defaultStudentDirectoryFilterState,
    personalState: { status: "signed-out" } satisfies StudentDirectoryPersonalState,
  });
  mockUseLocation.mockReturnValue({ pathname: "/students" });
  mockUseOutletContext.mockReturnValue({ currentUsername: null });
});

describe("students directory v2 layout", () => {
  it("uses the wide hub layout, title, ordered panels, aside links, and mobile action bar", () => {
    const markup = renderToStaticMarkup(createElement(StudentsLayout));
    expect(markup).toContain('data-v2-width="wide"');
    expect(markup).toContain("<h1>학생부</h1>");
    expect(markup).toContain('data-description="" data-sheet-description="1명"');
    expect(markup.indexOf('data-panel="student-directory-filter"')).toBeLessThan(markup.indexOf('data-panel="student-directory-display"'));
    expect(markup).toContain('data-collapsible="true"');
    expect(markup).toContain("모집한 학생");
    expect(markup).toContain("학생 평가 목록");
    expect(markup).toContain('data-mobile-action-bar="true"');
    expect(markup).not.toContain("모집한 학생의 성급");
  });

  it("disables filter and display panels after a list failure", () => {
    mockUseLoaderData.mockReturnValue({
      students: [], listStatus: "failed", filterState: defaultStudentDirectoryFilterState, personalState: { status: "signed-out" },
    });
    const markup = renderToStaticMarkup(createElement(StudentsLayout));
    expect(markup).toContain('data-panel="student-directory-filter" data-collapsible="false" data-disabled="true"');
    expect(markup).toContain('data-panel="student-directory-display" data-collapsible="true" data-disabled="true"');
  });

  it("shows the filter and enables display settings after a successful retry", () => {
    mockUseLoaderData.mockReturnValue({
      students: [], listStatus: "failed", filterState: defaultStudentDirectoryFilterState, personalState: { status: "signed-out" },
    });
    const rendered = render(createElement(StudentsLayout));

    expect(screen.queryByTestId("filter-panel-body")).toBeNull();
    expect(screen.queryByRole("button", { name: "표시 설정" })).toBeNull();

    mockUseLoaderData.mockReturnValue({
      students: [baseStudent], listStatus: "loaded", filterState: defaultStudentDirectoryFilterState, personalState: { status: "signed-out" },
    });
    rendered.rerender(createElement(StudentsLayout));

    expect(screen.getByTestId("filter-panel-body")).toBeTruthy();
    const displayToggle = screen.getByRole("button", { name: "표시 설정" });
    expect(displayToggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(displayToggle);
    expect(screen.getByLabelText("학생 카드에 표시할 정보")).toBeTruthy();
  });

  it("preserves the outlet-only render for student detail routes", () => {
    mockUseLocation.mockReturnValue({ pathname: "/students/123" });
    expect(renderToStaticMarkup(createElement(StudentsLayout))).toBe("outlet");
  });
});
