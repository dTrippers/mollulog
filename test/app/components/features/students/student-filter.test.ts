import { describe, expect, it } from "@jest/globals";
import { Attack, Defense } from "~/graphql/graphql";
import {
  createStudentFilterState,
  getFilteredStudentUids,
  type StudentFilterState,
} from "~/components/features/students/StudentFilter";

type TestStudent = Parameters<typeof getFilteredStudentUids>[0][number];

const baseStudent = {
  defenseType: Defense.Light,
  role: "striker" as const,
  position: "front" as const,
  tacticRole: "attacker" as const,
  initialTier: 3,
};

function student(overrides: Partial<TestStudent> & Pick<TestStudent, "uid" | "name" | "attackType" | "order">): TestStudent {
  return {
    ...baseStudent,
    ...overrides,
  };
}

describe("student filter", () => {
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
});
