import { describe, expect, it } from "@jest/globals";
import { getRecurringRaidStudents } from "~/domain/raid-portal";

describe("getRecurringRaidStudents", () => {
  it("returns students used in at least two distinct upcoming raids", () => {
    expect(
      getRecurringRaidStudents([
        { raidKey: "total:84", studentCounts: { himari: 100, kisaki: 80, niche: 1 } },
        { raidKey: "elimination:32", studentCounts: { himari: 90, kisaki: 0, rio: 70 } },
        { raidKey: "total:85", studentCounts: { himari: 75, kisaki: 60, rio: 50 } },
      ]),
    ).toEqual([
      { studentUid: "himari", raidKeys: ["total:84", "elimination:32", "total:85"], totalCount: 265 },
      { studentUid: "kisaki", raidKeys: ["total:84", "total:85"], totalCount: 140 },
      { studentUid: "rio", raidKeys: ["elimination:32", "total:85"], totalCount: 120 },
    ]);
  });

  it("ignores invalid counts and respects the result limit", () => {
    expect(
      getRecurringRaidStudents(
        [
          { raidKey: "one", studentCounts: { a: 4, b: 3, invalid: Number.NaN } },
          { raidKey: "two", studentCounts: { a: 2, b: 5, invalid: -1 } },
        ],
        1,
      ),
    ).toEqual([{ studentUid: "b", raidKeys: ["one", "two"], totalCount: 8 }]);
  });

  it("orders recurring students by their total party count", () => {
    expect(
      getRecurringRaidStudents([
        { raidKey: "one", studentCounts: { frequent: 1, popular: 100 } },
        { raidKey: "two", studentCounts: { frequent: 1, popular: 100 } },
        { raidKey: "three", studentCounts: { frequent: 1 } },
      ]),
    ).toEqual([
      { studentUid: "popular", raidKeys: ["one", "two"], totalCount: 200 },
      { studentUid: "frequent", raidKeys: ["one", "two", "three"], totalCount: 3 },
    ]);
  });

  it("returns up to ten students by default", () => {
    const studentCounts = Object.fromEntries(
      Array.from({ length: 11 }, (_, index) => [`student-${index}`, 11 - index]),
    );

    expect(
      getRecurringRaidStudents([
        { raidKey: "one", studentCounts },
        { raidKey: "two", studentCounts },
      ]),
    ).toHaveLength(10);
  });
});
