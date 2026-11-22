import { describe, expect, it } from "@jest/globals";
import {
  moveGrowthStudent,
  normalizeGrowthPlannerState,
  placeGrowthStudent,
  sortGrowthStudents,
} from "~/domain/growth-planner";

const students = [
  { uid: "a", name: "에리카", order: 20, plannerCreatedAt: "2026-07-02 00:00:00", plannerPosition: null },
  { uid: "b", name: "니코", order: 30, plannerCreatedAt: "2026-07-01 00:00:00", plannerPosition: null },
  { uid: "c", name: "케이", order: 10, plannerCreatedAt: "2026-07-03 00:00:00", plannerPosition: null },
];

const uids = (list: { uid: string }[]) => list.map(({ uid }) => uid);

describe("growth planner sorting", () => {
  it("sorts by planner registration date", () => {
    expect(uids(sortGrowthStudents(students, "planner-newest"))).toEqual(["c", "a", "b"]);
    expect(uids(sortGrowthStudents(students, "planner-oldest"))).toEqual(["b", "a", "c"]);
  });

  it("sorts by student release order", () => {
    expect(uids(sortGrowthStudents(students, "student-newest"))).toEqual(["b", "a", "c"]);
    expect(uids(sortGrowthStudents(students, "student-oldest"))).toEqual(["c", "a", "b"]);
  });

  it("sorts by Korean student name", () => {
    expect(uids(sortGrowthStudents(students, "name"))).toEqual(["b", "a", "c"]);
  });

  it("starts the manual order as newest registration first", () => {
    expect(uids(sortGrowthStudents(students, "manual"))).toEqual(["c", "a", "b"]);
  });

  it("follows stored positions and puts students without one on top", () => {
    const positioned = [
      { ...students[0], plannerPosition: 1 },
      { ...students[1], plannerPosition: 0 },
      // Added after the last reorder.
      { ...students[2], plannerPosition: null },
    ];
    expect(uids(sortGrowthStudents(positioned, "manual"))).toEqual(["c", "b", "a"]);
  });
});

describe("growth planner manual moves", () => {
  it("moves one place up or down and keeps the list at the edges", () => {
    expect(moveGrowthStudent(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveGrowthStudent(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveGrowthStudent(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveGrowthStudent(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveGrowthStudent(["a", "b", "c"], "x", 1)).toEqual(["a", "b", "c"]);
  });

  it("places a dragged student at a clamped index", () => {
    expect(placeGrowthStudent(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(placeGrowthStudent(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(placeGrowthStudent(["a", "b", "c"], "b", 99)).toEqual(["a", "c", "b"]);
  });
});

describe("growth planner state", () => {
  it("accepts a known sort order only", () => {
    expect(normalizeGrowthPlannerState({ sortOrder: "manual" })).toEqual({ sortOrder: "manual" });
    expect(normalizeGrowthPlannerState({ sortOrder: "unknown" })).toBeNull();
    expect(normalizeGrowthPlannerState([])).toBeNull();
    expect(normalizeGrowthPlannerState(null)).toBeNull();
  });
});
