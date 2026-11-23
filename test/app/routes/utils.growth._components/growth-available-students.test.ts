import { describe, expect, it } from "@jest/globals";
import { listAvailableGrowthStudents } from "~/routes/utils.growth._components/growth-available-students";

describe("listAvailableGrowthStudents", () => {
  const allStudentsMap = {
    "10000": { uid: "10000", name: "아루", altNames: ["사장"], order: 1 },
    "10001": { uid: "10001", name: "무츠키", altNames: [], order: 3 },
    "10002": { uid: "10002", name: "카요코", altNames: ["카요"], order: 2 },
  };

  it("lists the students not in the planner, newest first, with their other names", () => {
    expect(listAvailableGrowthStudents(allStudentsMap, new Set(["10002"]))).toEqual([
      { uid: "10001", name: "무츠키", altNames: [] },
      { uid: "10000", name: "아루", altNames: ["사장"] },
    ]);
  });
});
