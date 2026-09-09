import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  clearStudentFilters,
  createStudentFilterState,
  getActiveStudentDirectoryFilterCount,
  getFilteredStudentUids,
  getStudentDirectoryDisplaySettingsSummary,
  getStudentDirectoryLabel,
  groupStudentDirectoryStudents,
  hasActiveStudentFilters,
  StudentDirectoryDisplaySettings,
  default as StudentFilter,
  type StudentFilterState,
} from "~/components/features/students/StudentFilter";
import { Attack, Defense } from "~/graphql/graphql";
import { schoolNameLocale, schoolShortLocale } from "~/locales/ko";

type TestStudent = Parameters<typeof getFilteredStudentUids>[0][number];

const baseStudent = {
  defenseType: Defense.Light,
  role: "striker" as const,
  position: "front" as const,
  tacticRole: "attacker" as const,
  initialTier: 3,
};

function student(
  overrides: Partial<TestStudent> & Pick<TestStudent, "uid" | "name" | "attackType" | "order">,
): TestStudent {
  return {
    ...baseStudent,
    ...overrides,
  };
}

describe("student filter", () => {
  it("clears search and attribute filters while preserving the selected sort", () => {
    const state: StudentFilterState = {
      ...createStudentFilterState("tier"),
      attackTypes: [Attack.Explosive],
      defenseTypes: [Defense.Heavy],
      groupBy: "school",
      displayBy: "height",
      search: "아루",
    };

    expect(hasActiveStudentFilters(state)).toBe(true);

    const cleared = clearStudentFilters(state);

    expect(cleared).toEqual({
      ...createStudentFilterState("tier"),
      groupBy: "school",
      displayBy: "height",
      search: "",
    });
    expect(hasActiveStudentFilters(cleared)).toBe(false);
  });

  it("keeps the selected filter when only student tiers change", () => {
    const filterState: StudentFilterState = {
      ...createStudentFilterState("tier"),
      attackTypes: [Attack.Explosive],
    };
    const students = [
      student({ uid: "explosive-student", name: "폭발 학생", attackType: Attack.Explosive, order: 2, tier: 3 }),
      student({ uid: "mystic-student", name: "신비 학생", attackType: Attack.Mystic, order: 1, tier: 4 }),
    ];

    const updatedStudents = students.map((currentStudent) =>
      currentStudent.uid === "explosive-student" ? { ...currentStudent, tier: 5 } : currentStudent,
    );

    expect(getFilteredStudentUids(updatedStudents, filterState)).toEqual(["explosive-student"]);
  });

  it("filters the student list by search value", () => {
    const filterState: StudentFilterState = {
      ...createStudentFilterState("recent"),
      search: "아루",
    };
    const students = [
      student({ uid: "aru", name: "아루", attackType: Attack.Explosive, order: 2 }),
      student({ uid: "shiroko", name: "시로코", attackType: Attack.Explosive, order: 1 }),
    ];

    expect(getFilteredStudentUids(students, filterState)).toEqual(["aru"]);
  });

  it("combines directory filters with AND between fields and OR within each field", () => {
    const filterState: StudentFilterState = {
      ...createStudentFilterState("recent"),
      schools: ["millennium", "trinity"],
      equipmentSlots: [["hat"], ["bag", "watch"], []],
      initialTiers: [3, 5],
    };
    const students = [
      student({
        uid: "millennium-hat-bag",
        name: "밀레니엄 학생",
        school: "millennium",
        equipments: ["hat", "bag", "shoes"],
        initialTier: 3,
        attackType: Attack.Explosive,
        order: 1,
      }),
      student({
        uid: "trinity-hat-watch",
        name: "트리니티 학생",
        school: "trinity",
        equipments: ["hat", "watch", "shoes"],
        initialTier: 5,
        attackType: Attack.Mystic,
        order: 2,
      }),
      student({
        uid: "trinity-gloves-watch",
        name: "장갑 학생",
        school: "trinity",
        equipments: ["gloves", "watch", "shoes"],
        initialTier: 5,
        attackType: Attack.Mystic,
        order: 3,
      }),
    ];

    expect(getFilteredStudentUids(students, filterState)).toEqual(["trinity-hat-watch", "millennium-hat-bag"]);
  });

  it("searches family names and aliases and keeps deterministic sort ties", () => {
    const filterState: StudentFilterState = {
      ...createStudentFilterState("name"),
      search: "아루",
    };
    const students = [
      student({
        uid: "alias-match",
        name: "무명 학생",
        familyName: "아루",
        attackType: Attack.Explosive,
        order: 1,
      }),
      student({
        uid: "name-match-b",
        name: "아루",
        altNames: ["검은 학생"],
        attackType: Attack.Explosive,
        order: 2,
      }),
      student({
        uid: "name-match-a",
        name: "아루",
        altNames: ["검은 학생"],
        attackType: Attack.Explosive,
        order: 2,
      }),
    ];

    expect(getFilteredStudentUids(students, filterState)).toEqual(["alias-match", "name-match-a", "name-match-b"]);
  });

  it("keeps the selected student order inside each group and uses domain group order", () => {
    const students = [
      student({ uid: "mystic", name: "신비", attackType: Attack.Mystic, order: 3 }),
      student({ uid: "explosive", name: "폭발", attackType: Attack.Explosive, order: 2 }),
      student({ uid: "piercing", name: "관통", attackType: Attack.Piercing, order: 1 }),
    ];

    expect(groupStudentDirectoryStudents(students, "attackType")).toEqual([
      { key: Attack.Explosive, label: "폭발", students: [students[1]] },
      { key: Attack.Piercing, label: "관통", students: [students[2]] },
      { key: Attack.Mystic, label: "신비", students: [students[0]] },
    ]);
  });

  it("preserves public strings and shows an explicit missing-value label", () => {
    const studentWithPublicValues = student({
      uid: "public-values",
      name: "학생",
      school: "millennium",
      equipments: ["hat"],
      attackType: Attack.Explosive,
      order: 1,
    });
    const catalog = {
      profile: { age: "17세", schoolYear: "2학년", height: "159.7cm" },
      terrainAdaptations: { street: "SS", outdoor: "A", indoor: "B" },
    };

    expect(getStudentDirectoryLabel({ ...studentWithPublicValues, catalog }, "age")).toEqual({
      value: "17세",
      ariaLabel: "17세",
    });
    expect(getStudentDirectoryLabel({ ...studentWithPublicValues, catalog: null }, "height")).toEqual({
      value: "정보 없음",
      ariaLabel: "정보 없음",
    });
  });

  it("uses the current Odyssey school code for directory labels and groups", () => {
    expect(schoolNameLocale.odyssey).toBe("오디세이아 해양학교");
    expect(schoolShortLocale.odyssey).toBe("오디세이아");

    const odysseyStudent = student({
      uid: "odyssey-student",
      name: "오디세이아 학생",
      school: "odyssey",
      attackType: Attack.Explosive,
      order: 1,
    });
    const catalog = {
      profile: { age: "17세", schoolYear: "2학년", height: "159.7cm" },
      terrainAdaptations: { street: "SS", outdoor: "A", indoor: "B" },
    };

    expect(getStudentDirectoryLabel({ ...odysseyStudent, catalog }, "school")).toEqual({
      value: "오디세이아",
      ariaLabel: "오디세이아",
    });
    expect(groupStudentDirectoryStudents([odysseyStudent], "school")).toEqual([
      { key: "odyssey", label: "오디세이아", students: [odysseyStudent] },
    ]);
  });

  it("uses 성급 terminology for the initial-tier filter and sort", () => {
    const filterMarkup = renderToStaticMarkup(
      createElement(StudentFilter, {
        students: [student({ uid: "tier-student", name: "성급 학생", attackType: Attack.Explosive, order: 1 })],
        state: { ...createStudentFilterState("tier"), initialTiers: [3] },
        sortBy: ["tier"],
        useFilter: true,
        directory: true,
      }),
    );
    const settingsMarkup = renderToStaticMarkup(
      createElement(StudentDirectoryDisplaySettings, {
        state: createStudentFilterState("tier"),
        onStateChange: () => undefined,
      }),
    );

    expect(filterMarkup).toContain("초기 성급");
    expect(filterMarkup).toContain("★ 성급순");
    expect(filterMarkup).toContain('aria-label="초기 성급 3성"');
    expect(filterMarkup).toContain('class="size-3.5 text-yellow-500"');
    expect(filterMarkup).toContain(">3</span>");
    expect(filterMarkup).not.toContain(">3성</span>");
    expect(filterMarkup).not.toContain("초기 등급");
    expect(filterMarkup).not.toContain("★ 등급순");
    expect(settingsMarkup).not.toContain("★ 성급순");
  });

  it("renders display settings in display and group order with a user-facing summary", () => {
    const state: StudentFilterState = {
      ...createStudentFilterState("tier"),
      displayBy: "height",
      groupBy: "school",
    };
    const markup = renderToStaticMarkup(
      createElement(StudentDirectoryDisplaySettings, {
        state,
        onStateChange: () => undefined,
      }),
    );

    expect(markup.indexOf("학생 카드 표시 정보")).toBeLessThan(markup.indexOf("학생 그룹"));
    expect(markup).toContain("키");
    expect(markup).toContain("학교");
    expect(markup).not.toContain("학생 정렬");
    expect(markup).toContain("space-y-0");
    expect(getStudentDirectoryDisplaySettingsSummary(state)).toBe("키 · 학교");
  });

  it("offers 없음 as the default display choice", () => {
    const markup = renderToStaticMarkup(
      createElement(StudentDirectoryDisplaySettings, {
        state: createStudentFilterState("recent"),
        onStateChange: () => undefined,
      }),
    );

    expect(markup).toContain("없음");
    expect(getStudentDirectoryDisplaySettingsSummary(createStudentFilterState("recent"))).toBe("없음 · 그룹 없음");
  });

  it("keeps advanced directory filters closed by default and exposes disclosure semantics", () => {
    const markup = renderToStaticMarkup(
      createElement(StudentFilter, {
        students: [student({ uid: "closed-student", name: "학생", attackType: Attack.Explosive, order: 1 })],
        state: createStudentFilterState("recent"),
        sortBy: ["recent", "old", "name", "tier"],
        useFilter: true,
        directory: true,
      }),
    );

    expect(markup).toContain("더 보기");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toMatch(/aria-controls="[^"]+"/);
    expect(markup).not.toContain('aria-label="초기 성급 1성"');
    expect(markup).not.toContain("장비 1");
  });

  it("hides every base filter row icon in the narrow sidebar while preserving other row styles", () => {
    const markup = renderToStaticMarkup(
      createElement(StudentFilter, {
        students: [student({ uid: "compact-student", name: "학생", attackType: Attack.Explosive, order: 1 })],
        state: createStudentFilterState("recent"),
        sortBy: ["recent", "old", "name", "tier"],
        useFilter: true,
        directory: true,
      }),
    );

    expect((markup.match(/lg:\[&amp;&gt;svg\]:hidden/g) ?? []).length).toBe(6);
    expect((markup.match(/flex-nowrap gap-x-0\.5 md:gap-x-0\.5/g) ?? []).length).toBe(2);
    expect(markup).toContain("FRONT");
    expect(markup).toContain("MIDDLE");
    expect(markup).toContain("BACK");
    expect(markup).toContain("딜러");
    expect(markup).toContain("탱커");
  });

  it("keeps shared filter rows unchanged for non-directory consumers", () => {
    const markup = renderToStaticMarkup(
      createElement(StudentFilter, {
        students: [student({ uid: "shared-filter-student", name: "학생", attackType: Attack.Explosive, order: 1 })],
        state: createStudentFilterState("recent"),
        sortBy: ["recent", "old", "name"],
        useFilter: true,
        useSearch: true,
      }),
    );

    expect(markup).not.toContain("lg:[&amp;&gt;svg]:hidden");
    expect(markup).not.toContain("flex-nowrap gap-x-0.5 md:gap-x-0.5");
    expect(markup).toContain("폭발");
    expect(markup).toContain("FRONT");
    expect(markup).toContain("학생 이름");
  });

  it("opens persisted advanced filters and reports the selected-value count", () => {
    const state: StudentFilterState = {
      ...createStudentFilterState("recent"),
      schools: ["millennium"],
      equipmentSlots: [["hat"], [], []],
      initialTiers: [3],
    };
    const markup = renderToStaticMarkup(
      createElement(StudentFilter, {
        students: [
          student({
            uid: "open-student",
            name: "학생",
            school: "millennium",
            attackType: Attack.Explosive,
            order: 1,
          }),
        ],
        state,
        sortBy: ["recent", "old", "name", "tier"],
        useFilter: true,
        directory: true,
      }),
    );

    expect(getActiveStudentDirectoryFilterCount(state)).toBe(3);
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("3개 적용");
    expect(markup).toContain("학교");
    expect(markup).toContain("장비 1");
    expect(markup).toContain('aria-label="초기 성급 3성"');
  });

  it("renders three horizontal choices for each equipment slot and initial rarity", () => {
    const state: StudentFilterState = {
      ...createStudentFilterState("recent"),
      initialTiers: [1],
    };
    const markup = renderToStaticMarkup(
      createElement(StudentFilter, {
        students: [
          student({
            uid: "options-student",
            name: "학생",
            school: "millennium",
            attackType: Attack.Explosive,
            order: 1,
          }),
        ],
        state,
        useFilter: true,
        directory: true,
      }),
    );

    expect((markup.match(/장비 1/g) ?? []).length).toBe(1);
    expect((markup.match(/장비 2/g) ?? []).length).toBe(1);
    expect((markup.match(/장비 3/g) ?? []).length).toBe(1);
    expect((markup.match(/모자/g) ?? []).length).toBe(1);
    expect((markup.match(/장갑/g) ?? []).length).toBe(1);
    expect((markup.match(/신발/g) ?? []).length).toBe(1);
    expect((markup.match(/가방/g) ?? []).length).toBe(1);
    expect((markup.match(/배지/g) ?? []).length).toBe(1);
    expect((markup.match(/헤어핀/g) ?? []).length).toBe(1);
    expect((markup.match(/부적/g) ?? []).length).toBe(1);
    expect((markup.match(/시계/g) ?? []).length).toBe(1);
    expect((markup.match(/목걸이/g) ?? []).length).toBe(1);
    expect((markup.match(/flex-nowrap/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((markup.match(/aria-label="초기 성급 [123]성"/g) ?? []).length).toBe(3);
  });

  it("clears advanced filters while preserving sort, group, and display", () => {
    const state: StudentFilterState = {
      ...createStudentFilterState("tier"),
      schools: ["millennium"],
      equipmentSlots: [["hat"], ["bag"], []],
      initialTiers: [2],
      groupBy: "school",
      displayBy: "height",
      search: "아루",
    };
    const cleared = clearStudentFilters(state);

    expect(cleared).toEqual({
      ...createStudentFilterState("tier"),
      groupBy: "school",
      displayBy: "height",
      search: "",
    });
    expect(getActiveStudentDirectoryFilterCount(cleared)).toBe(0);
  });
});
