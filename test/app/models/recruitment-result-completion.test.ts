import { describe, expect, it } from "@jest/globals";
import { RecruitmentTypeEnum } from "../../../app/graphql/graphql";
import { applyRecruitmentResultStudentCompletion } from "../../../app/models/recruitment-result-completion";

describe("recruitment-result-completion", () => {
  it("keeps completedAt when uncompleting one duplicate occurrence leaves another recruited student", () => {
    const result = applyRecruitmentResultStudentCompletion(
      {
        contentUid: "content-a",
        completedAt: "2026-06-08T01:00:00.000Z",
        recruitedStudents: [
          { studentUid: "hina", tier: 3, pickup: true },
          { studentUid: "hina", tier: 3, pickup: true },
        ],
        exchangedStudents: [],
      },
      {
        contentUid: "content-a",
        studentUid: "hina",
        completed: false,
        recruitment: { tier: 3, pickup: true, recruitmentType: RecruitmentTypeEnum.Usual },
        now: "2026-06-08T02:00:00.000Z",
      },
    );

    expect(result).toEqual({
      contentUid: "content-a",
      completedAt: "2026-06-08T01:00:00.000Z",
      recruitedStudents: [{ studentUid: "hina", tier: 3, pickup: true }],
      exchangedStudents: [],
    });
  });

  it("clears completedAt when uncompleting removes the final recruited student and there are no exchange students", () => {
    const result = applyRecruitmentResultStudentCompletion(
      {
        contentUid: "content-a",
        completedAt: "2026-06-08T01:00:00.000Z",
        recruitedStudents: [{ studentUid: "hina", tier: 3, pickup: true }],
        exchangedStudents: [],
      },
      {
        contentUid: "content-a",
        studentUid: "hina",
        completed: false,
        recruitment: { tier: 3, pickup: true, recruitmentType: RecruitmentTypeEnum.Usual },
        now: "2026-06-08T02:00:00.000Z",
      },
    );

    expect(result.completedAt).toBeNull();
    expect(result.recruitedStudents).toEqual([]);
  });

  it("appends a completed student without replacing same-uid existing entries", () => {
    const result = applyRecruitmentResultStudentCompletion(
      {
        contentUid: "content-a",
        completedAt: "2026-06-08T01:00:00.000Z",
        recruitedStudents: [
          { studentUid: "hina", tier: 3, pickup: true },
          { studentUid: "hina", tier: 3, pickup: true },
        ],
        exchangedStudents: [],
      },
      {
        contentUid: "content-a",
        studentUid: "aru",
        completed: true,
        recruitment: { tier: 3, pickup: false, recruitmentType: RecruitmentTypeEnum.Usual },
        now: "2026-06-08T02:00:00.000Z",
      },
    );

    expect(result.recruitedStudents).toEqual([
      { studentUid: "hina", tier: 3, pickup: true },
      { studentUid: "hina", tier: 3, pickup: true },
      { studentUid: "aru", tier: 3, pickup: false },
    ]);
  });
});
