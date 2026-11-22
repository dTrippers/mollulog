import { describe, expect, it } from "@jest/globals";
import {
  clearStudentFilters,
  createStudentFilterState,
  getFilteredStudentUids,
  hasActiveStudentFilters,
} from "~/components/features/students/StudentFilter";
import { Attack, Defense } from "~/graphql/graphql";

type TestStudent = Parameters<typeof getFilteredStudentUids>[0][number];

function student(
  overrides: Partial<TestStudent> & Pick<TestStudent, "uid" | "name" | "attackType" | "order">,
): TestStudent {
  return {
    defenseType: Defense.Light,
    role: "striker",
    position: "front",
    tacticRole: "attacker",
    ...overrides,
  };
}

describe("shared student filter", () => {
  it("filters the student list by attributes and Korean name search", () => {
    const students = [
      student({ uid: "aru", name: "아루", attackType: Attack.Explosive, order: 2 }),
      student({ uid: "alias", name: "무명 학생", familyName: "아루", attackType: Attack.Explosive, order: 1 }),
      student({ uid: "shiroko", name: "시로코", altNames: ["아루 별칭"], attackType: Attack.Mystic, order: 3 }),
    ];

    expect(
      getFilteredStudentUids(students, {
        ...createStudentFilterState("name"),
        attackTypes: [Attack.Explosive],
        search: "아루",
      }),
    ).toEqual(["alias", "aru"]);
  });

  it("keeps username student sorting, including tier, and clears filters while preserving sort", () => {
    const students = [
      student({ uid: "a", name: "아루", attackType: Attack.Explosive, order: 2, tier: 3 }),
      student({ uid: "b", name: "히나", attackType: Attack.Explosive, order: 1, tier: 5 }),
    ];
    const state = {
      ...createStudentFilterState("tier"),
      attackTypes: [Attack.Explosive],
      search: "아루",
    };

    expect(getFilteredStudentUids(students, state)).toEqual(["a"]);
    expect(hasActiveStudentFilters(state)).toBe(true);
    expect(clearStudentFilters(state)).toEqual({ ...createStudentFilterState("tier"), search: "" });
  });

  it("keeps deterministic ties for the shared name sort", () => {
    const students = [
      student({ uid: "b", name: "아루", attackType: Attack.Explosive, order: 1 }),
      student({ uid: "a", name: "아루", attackType: Attack.Explosive, order: 1 }),
    ];

    expect(getFilteredStudentUids(students, createStudentFilterState("name"))).toEqual(["a", "b"]);
  });
});
