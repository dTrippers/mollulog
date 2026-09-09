import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createStudentFilterState, type StudentFilterState } from "~/components/features/students/StudentFilter";
import type { StudentDirectoryStudent } from "~/models/student-directory";

const mockStudentCards = jest.fn(
  ({ students, layout, cardSize }: { students?: { label?: ReactNode }[]; layout?: string; cardSize?: string }) =>
    createElement(
      "div",
      { "data-layout": layout, "data-card-size": cardSize },
      students?.map((student, index) => createElement("div", { key: index }, student.label)),
    ),
);
const mockUseOutletContext = jest.fn();
const mockNavigate = jest.fn();

jest.mock("~/components/features/students", () => ({
  StudentCards: mockStudentCards,
}));

jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useOutletContext: () => mockUseOutletContext(),
  };
});

import Students from "~/routes/students._index";

function student(overrides: Partial<StudentDirectoryStudent> = {}): StudentDirectoryStudent {
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
    catalog: {
      profile: { age: "17세", schoolYear: "2학년", height: "159.7cm" },
      terrainAdaptations: { street: "SS", outdoor: "A", indoor: "B" },
    },
    ...overrides,
  } as StudentDirectoryStudent;
}

function renderList(overrides: Partial<StudentFilterState> = {}) {
  mockUseOutletContext.mockReturnValue({
    students: [student()],
    filterState: { ...createStudentFilterState("recent"), ...overrides },
  });
  return renderToStaticMarkup(createElement(Students));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("students list rendering", () => {
  it("does not pass a card label when display is disabled", () => {
    const markup = renderList();
    const { students } = mockStudentCards.mock.calls.at(-1)?.[0] as {
      students: Array<{ label?: ReactNode }>;
    };

    expect(students[0]).not.toHaveProperty("label");
    expect(markup).not.toContain("없음");
  });

  it("passes the selected public value as the single card label without changing card layout", () => {
    const markup = renderList({ displayBy: "height" });

    expect(markup).toContain("159.7cm");
    expect(markup).toContain('title="159.7cm"');
    expect(markup).not.toContain('aria-label="159.7cm"');
    expect(markup).toContain('data-layout="responsive-wrap"');
    expect(markup).toContain('data-card-size="lg"');
  });

  it("renders separate group sections while preserving the selected label", () => {
    const markup = renderList({ groupBy: "school", displayBy: "equipment1" });

    expect(markup).toContain("밀레니엄");
    expect(markup).toContain("모자");
  });

  it("uses the explicit missing-value label for absent catalog data", () => {
    mockUseOutletContext.mockReturnValue({
      students: [student({ catalog: null })],
      filterState: { ...createStudentFilterState("recent"), displayBy: "age" },
    });

    const markup = renderToStaticMarkup(createElement(Students));

    expect(markup).toContain("정보 없음");
  });

  it("renders the initial tier with a yellow solid star and an accessible label", () => {
    const markup = renderList({ displayBy: "initialTier" });

    expect(markup).toContain('aria-label="초기 성급 3성"');
    expect(markup).toContain('title="초기 성급 3성"');
    expect(markup).toContain('class="size-3 shrink-0"');
    expect(markup).toContain("text-yellow-300");
    expect(markup).toContain(">3</span>");
    expect(markup).toContain('data-layout="responsive-wrap"');
    expect(markup).toContain('data-card-size="lg"');
  });

  it("keeps a missing initial tier accessible without a generic-span aria-label", () => {
    mockUseOutletContext.mockReturnValue({
      students: [student({ initialTier: 0 })],
      filterState: { ...createStudentFilterState("recent"), displayBy: "initialTier" },
    });

    const markup = renderToStaticMarkup(createElement(Students));

    expect(markup).toContain('<span class="sr-only">초기 성급 정보 없음</span>');
    expect(markup).toContain('<span aria-hidden="true">정보 없음</span>');
    expect(markup).not.toContain('aria-label="초기 성급 정보 없음"');
    expect(markup).toContain('title="초기 성급 정보 없음"');
  });

  it("renders terrain adaptation as an icon with an accessible terrain and rank label", () => {
    const markup = renderList({ displayBy: "street" });

    expect(markup).toContain('src="https://assets.mollulog.net/assets/images/ui/terrain-SS.png"');
    expect(markup).toContain('alt=""');
    expect(markup).toContain('aria-label="시가지 적성 SS"');
    expect(markup).toContain('title="시가지 적성 SS"');
    expect(markup).not.toContain(">SS<");
  });

  it("keeps missing terrain values explicit and accessible", () => {
    mockUseOutletContext.mockReturnValue({
      students: [student({ catalog: null })],
      filterState: { ...createStudentFilterState("recent"), displayBy: "street" },
    });

    const markup = renderToStaticMarkup(createElement(Students));

    expect(markup).toContain("정보 없음");
    expect(markup).toContain('<span class="sr-only">시가지 적성 정보 없음</span>');
    expect(markup).toContain('<span aria-hidden="true">정보 없음</span>');
    expect(markup).not.toContain('aria-label="시가지 적성 정보 없음"');
    expect(markup).toContain('title="시가지 적성 정보 없음"');
    expect(markup).not.toContain("terrain-SS.png");
  });

  it("uses semantic text colors for attack and defense labels without colored backgrounds", () => {
    const attackMarkup = renderList({ displayBy: "attackType" });
    expect(attackMarkup).toContain("폭발");
    expect(attackMarkup).toContain("text-red-300");
    expect(attackMarkup).not.toContain("bg-red-");

    const defenseMarkup = renderList({ displayBy: "defenseType" });
    expect(defenseMarkup).toContain("경장");
    expect(defenseMarkup).toContain("text-red-300");
    expect(defenseMarkup).not.toContain("bg-red-");
  });
});
