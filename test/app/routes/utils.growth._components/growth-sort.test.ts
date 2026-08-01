import { describe, expect, it } from "@jest/globals";
import { sortGrowthStudents } from "~/routes/utils.growth._components/growth-sort";

const students = [
  { uid: "a", name: "에리카", order: 20, plannerCreatedAt: "2026-07-02 00:00:00" },
  { uid: "b", name: "니코", order: 30, plannerCreatedAt: "2026-07-01 00:00:00" },
  { uid: "c", name: "케이", order: 10, plannerCreatedAt: "2026-07-03 00:00:00" },
];

describe("growth planner sorting", () => {
  it("sorts by planner registration date", () => {
    expect(sortGrowthStudents(students, "planner-newest").map(({ uid }) => uid)).toEqual(["c", "a", "b"]);
    expect(sortGrowthStudents(students, "planner-oldest").map(({ uid }) => uid)).toEqual(["b", "a", "c"]);
  });

  it("sorts by student release order", () => {
    expect(sortGrowthStudents(students, "student-newest").map(({ uid }) => uid)).toEqual(["b", "a", "c"]);
    expect(sortGrowthStudents(students, "student-oldest").map(({ uid }) => uid)).toEqual(["c", "a", "b"]);
  });

  it("sorts by Korean student name", () => {
    expect(sortGrowthStudents(students, "name").map(({ uid }) => uid)).toEqual(["b", "a", "c"]);
  });
});
