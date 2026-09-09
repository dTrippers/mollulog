import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("~/components/features/layout", () => ({ Page: jest.fn(() => null) }));
jest.mock("~/components/features/students/usePersistentStudentFilterState", () => ({
  usePersistentStudentFilterState: jest.fn(),
}));
jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useLoaderData: jest.fn(),
    useLocation: jest.fn(),
  };
});

import { useLoaderData, useLocation } from "react-router";
import { Page } from "~/components/features/layout";
import { createStudentFilterState } from "~/components/features/students/StudentFilter";
import { usePersistentStudentFilterState } from "~/components/features/students/usePersistentStudentFilterState";
import StudentsLayout from "~/routes/students";

const mockPage = Page as unknown as jest.Mock;
const mockUseLoaderData = useLoaderData as unknown as jest.Mock;
const mockUseLocation = useLocation as unknown as jest.Mock;
const mockUsePersistentStudentFilterState = usePersistentStudentFilterState as unknown as jest.Mock;
const mockSetFilterState = jest.fn();

function createStudent() {
  return {
    uid: "student-a",
    name: "학생",
    familyName: null,
    altNames: [],
    school: "millennium",
    initialTier: 3,
    order: 1,
    attackType: "explosive",
    defenseType: "light",
    position: "front",
    tacticRole: "attacker",
    birthday: null,
    role: "striker",
    equipments: ["hat", "bag", "shoes"],
    released: true,
    catalog: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  const filterState = createStudentFilterState("tier");
  mockUseLoaderData.mockReturnValue({ students: [createStudent()], filterState });
  mockUseLocation.mockReturnValue({ pathname: "/students" });
  mockUsePersistentStudentFilterState.mockReturnValue([filterState, mockSetFilterState]);
});

describe("students directory panels", () => {
  it("splits filters from display settings and keeps the first panel expanded", () => {
    renderToStaticMarkup(createElement(StudentsLayout));

    const pageProps = mockPage.mock.calls.at(-1)?.[0] as {
      panels: Array<{
        title: string;
        description?: string;
        collapsible?: boolean;
        headerAction?: {
          props: {
            text?: string;
            size?: string;
            variant?: string;
            onClick?: () => void;
          };
        };
        children: { type: unknown; props: Record<string, unknown> };
      }>;
      links?: unknown[];
    };
    const { panels, links } = pageProps;

    expect(panels.map((panel) => panel.title)).toEqual(["필터 및 정렬", "표시 설정"]);
    expect(panels[0].collapsible).toBeUndefined();
    expect(panels[1].collapsible).toBeUndefined();
    expect(panels[0].description).toBe("1명 중 1명 표시 중");
    expect(panels[1].description).toBe("없음 · 그룹 없음");

    expect(panels[0].children.props.sortBy).toEqual(["recent", "old", "name", "tier"]);
    expect(panels[0].children.props.directory).toBe(true);
    expect(panels[1].children.props.sortBy).toBeUndefined();
    expect(links).toBeUndefined();
    expect(panels[0].headerAction).toBeUndefined();
    expect(panels[1].headerAction).toBeUndefined();
  });

  it("places filter and display resets in their panel headers and preserves unrelated state", () => {
    const filterState = {
      ...createStudentFilterState("tier"),
      attackTypes: ["explosive" as const],
      displayBy: "height" as const,
      groupBy: "school" as const,
      search: "아루",
    };
    mockUseLoaderData.mockReturnValue({ students: [createStudent()], filterState });
    mockUsePersistentStudentFilterState.mockReturnValue([filterState, mockSetFilterState]);

    renderToStaticMarkup(createElement(StudentsLayout));

    const { panels } = mockPage.mock.calls.at(-1)?.[0] as {
      panels: Array<{
        headerAction?: {
          props: {
            text?: string;
            size?: string;
            variant?: string;
            onClick?: () => void;
          };
        };
      }>;
    };
    const filterAction = panels[0].headerAction;
    const displayAction = panels[1].headerAction;

    expect(filterAction?.props).toMatchObject({ text: "필터 해제", size: "xs", variant: "danger-subtle" });
    expect(displayAction?.props).toMatchObject({ text: "초기화", size: "xs", variant: "danger-subtle" });

    filterAction?.props.onClick?.();
    const filterUpdater = mockSetFilterState.mock.calls.at(-1)?.[0] as (
      state: typeof filterState,
    ) => typeof filterState;
    expect(filterUpdater(filterState)).toEqual({
      ...createStudentFilterState("tier"),
      groupBy: "school",
      displayBy: "height",
      search: "",
    });

    displayAction?.props.onClick?.();
    const displayUpdater = mockSetFilterState.mock.calls.at(-1)?.[0] as (
      state: typeof filterState,
    ) => typeof filterState;
    expect(displayUpdater(filterState)).toEqual({ ...filterState, groupBy: "none", displayBy: "none" });
  });
});
