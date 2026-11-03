import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Attack, Defense } from "~/graphql/graphql";
import { defaultStudentDirectoryFilterState, type StudentDirectoryFilterState, type StudentDirectoryPersonalState } from "~/domain/student-directory";
import type { StudentDirectoryStudent } from "~/models/student-directory";

const mockUseOutletContext = jest.fn();
const mockRevalidate = jest.fn();
const mockUseLocation = jest.fn(() => ({ pathname: "/students", search: "", hash: "", key: "test" }));
jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useLocation: () => mockUseLocation(),
    useNavigationType: () => "PUSH",
    useOutletContext: () => mockUseOutletContext(),
    useRevalidator: () => ({ revalidate: mockRevalidate }),
  };
});
jest.mock("~/components/v2/features/students/StudentThumb", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    StudentThumb: ({ name, linkTo, scrimLabel, scrimAriaLabel }: { name: string; linkTo: string; scrimLabel?: React.ReactNode; scrimAriaLabel?: string }) =>
      React.createElement("a", { href: linkTo, "aria-label": scrimAriaLabel }, scrimLabel, React.createElement("span", null, name)),
  };
});

import Students from "~/routes/students._index";
import { V2Page } from "~/components/v2/layout/V2Page";

function student(overrides: Partial<StudentDirectoryStudent> = {}): StudentDirectoryStudent {
  return {
    uid: "student-a",
    name: "학생",
    familyName: null,
    altNames: [],
    school: "millennium",
    initialTier: 3,
    order: 1,
    releaseAt: "2025-03-07T00:00:00.000Z",
    attackType: Attack.Explosive,
    defenseType: Defense.Light,
    weaponType: "ar",
    acquisitionType: "regular",
    canUseCover: true,
    skillEffectTags: [],
    club: { uid: "club-1", name: "게임개발부" },
    studentVariant: { primaryStudent: { uid: "student-a" } },
    position: "front",
    tacticRole: "attacker",
    birthday: "2000-01-01",
    role: "striker",
    equipments: ["hat", "bag", "shoes"],
    released: false,
    catalog: null,
    ...overrides,
  };
}

const personal: StudentDirectoryPersonalState = { status: "signed-out" };

function renderList({
  students = [student()],
  results = students,
  filterState = defaultStudentDirectoryFilterState,
  listStatus = "loaded",
  personalState = personal,
}: {
  students?: StudentDirectoryStudent[];
  results?: StudentDirectoryStudent[];
  filterState?: StudentDirectoryFilterState;
  listStatus?: "loaded" | "failed";
  personalState?: StudentDirectoryPersonalState;
} = {}) {
  mockUseOutletContext.mockReturnValue({
    students,
    results,
    listStatus,
    filterState,
    personalState,
    setFilterState: jest.fn(),
    onRequestSignIn: jest.fn(),
  });
  return renderToStaticMarkup(createElement(V2Page, { width: "wide", children: createElement(Students) }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("students directory main panel", () => {
  it("shows the result count without reserving a card label slot by default", () => {
    const markup = renderList();
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('data-student-directory-toolbar="true"');
    expect(markup).toContain(">1명</span>");
    expect(markup).not.toContain('aria-label="2025/03/07 출시 예정"');
    expect(markup).not.toContain(">예정</span>");
    expect(markup).not.toContain("bg-v2-scrim");
    expect(markup).toContain('href="/students/student-a"');
  });

  it("renders compact and full released dates for the card layout's narrow and wide breakpoints", () => {
    const markup = renderList({
      students: [student({ released: true, releaseAt: "2025-03-07T00:00:00.000Z" })],
      filterState: { ...defaultStudentDirectoryFilterState, sort: "release", displayBy: "sortValue" },
    });
    expect(markup).toContain('<span class="md:hidden">25/03/07</span>');
    expect(markup).toContain('<span class="hidden md:inline">2025/03/07</span>');
    expect(markup).toContain('aria-label="2025/03/07"');
  });

  it("shows an explicit empty-results state and keeps reset in the result summary", () => {
    const markup = renderList({
      results: [],
      filterState: { ...defaultStudentDirectoryFilterState, attackTypes: [Attack.Explosive] },
    });
    expect(markup).toContain(">0명</span>");
    expect(markup).toContain("조건에 맞는 학생이 없어요");
    expect(markup.match(/초기화/g)).toHaveLength(1);
    expect(markup).toContain("폭발");
  });

  it("renders grouping headings and honors a selected card label", () => {
    const first = student({ uid: "one", school: "millennium" });
    const second = student({ uid: "two", school: "trinity", initialTier: 2 });
    const markup = renderList({
      students: [first, second],
      results: [first, second],
      filterState: { ...defaultStudentDirectoryFilterState, groupBy: "school", displayBy: "initialTier" },
    });
    expect(markup).toContain("밀레니엄");
    expect(markup).toContain("트리니티");
    expect(markup).toContain("초기 성급 2성");
  });

  it("keeps the public list visible after personal record failure without a false unrecruited label", () => {
    const markup = renderList({ personalState: { status: "failed" } });
    expect(markup).toContain("내 기록을 불러오지 못했어요");
    expect(markup).toContain("다시 시도");
    expect(markup).toContain(">1명</span>");
    expect(markup).not.toContain("미모집");
  });

  it("renders list failure in the route and disables search and sorting", () => {
    const markup = renderList({ students: [], results: [], listStatus: "failed" });
    expect(markup).toContain("학생 목록을 불러오지 못했어요");
    expect(markup).toContain("다시 시도");
    expect(markup).toContain("학생 이름");
    expect(markup).toContain("disabled=");
    expect(markup).not.toContain("aria-live=");
  });
});
