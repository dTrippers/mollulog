import { describe, expect, it } from "@jest/globals";
import {
  createRecruitmentResultStudentsFromPickupHistory,
  getRecruitmentResultTrialFromPickupHistory,
  mergeRecruitmentResultStudent,
  normalizeRecruitmentResultStudents,
  removeRecruitmentResultStudent,
  sanitizeRecruitmentResultStudents,
} from "../../../app/models/recruitment-result";

describe("recruitment-result", () => {
  it("preserves recruited student order and duplicates for pickup history display", () => {
    const students = createRecruitmentResultStudentsFromPickupHistory(
      {
        result: [
          { trial: 10, tier3Count: 2, tier3StudentIds: ["hina", "aru"] },
          { trial: 20, tier3Count: 1, tier3StudentIds: ["hina"] },
        ],
      },
      new Set(["hina"]),
      { hina: 3, aru: 3 },
    );

    expect(students).toEqual([
      { studentUid: "hina", tier: 3, pickup: true },
      { studentUid: "aru", tier: 3, pickup: false },
      { studentUid: "hina", tier: 3, pickup: true },
    ]);
  });

  it("uses the max trial from pickup history results", () => {
    expect(
      getRecruitmentResultTrialFromPickupHistory({
        result: [
          { trial: 10, tier3Count: 0, tier3StudentIds: [] },
          { trial: 80, tier3Count: 1, tier3StudentIds: ["hina"] },
          { trial: 30, tier3Count: 0, tier3StudentIds: [] },
        ],
      }),
    ).toBe(80);
  });

  it("deduplicates only for recruited_students projection sync", () => {
    expect(
      normalizeRecruitmentResultStudents([
        { studentUid: "hina", tier: 3, pickup: false },
        { studentUid: "hina", tier: 5, pickup: true },
        { studentUid: "aru", tier: 3, pickup: false },
      ]),
    ).toEqual([
      { studentUid: "hina", tier: 5, pickup: true },
      { studentUid: "aru", tier: 3, pickup: false },
    ]);
  });

  it("sanitizes stored recruited students without deleting duplicates", () => {
    expect(
      sanitizeRecruitmentResultStudents([
        { studentUid: " hina ", tier: 15, pickup: true },
        { studentUid: "hina", tier: 0, pickup: false },
        { studentUid: "", tier: 3, pickup: false },
      ]),
    ).toEqual([
      { studentUid: "hina", tier: 9, pickup: true },
      { studentUid: "hina", tier: 1, pickup: false },
    ]);
  });

  it("merges a completed student without replacing other recruited students", () => {
    expect(
      mergeRecruitmentResultStudent(
        [
          { studentUid: "hina", tier: 3, pickup: false },
          { studentUid: "aru", tier: 4, pickup: true },
        ],
        { studentUid: "hina", tier: 5, pickup: true },
      ),
    ).toEqual([
      { studentUid: "hina", tier: 5, pickup: true },
      { studentUid: "aru", tier: 4, pickup: true },
    ]);
  });

  it("removes only the target completed student", () => {
    expect(
      removeRecruitmentResultStudent(
        [
          { studentUid: "hina", tier: 3, pickup: true },
          { studentUid: "aru", tier: 4, pickup: false },
        ],
        "hina",
      ),
    ).toEqual([{ studentUid: "aru", tier: 4, pickup: false }]);
  });
});
