import { describe, expect, it } from "@jest/globals";
import {
  appendRecruitmentResultStudent,
  createRecruitmentResultStudentsFromPickupHistory,
  getRecruitmentResultCountStats,
  getRecruitmentResultTier3CountFromPickupHistory,
  getRecruitmentResultTrialFromPickupHistory,
  mergeEditableRecruitmentResultStudents,
  normalizeRecruitmentResultStudents,
  removeRecruitmentResultStudent,
  sanitizeRecruitmentResultStudents,
} from "~/domain/recruitment-result";
import { RecruitmentTypeEnum } from "../../../app/graphql/graphql";

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

  it("sums explicit tier3 count from pickup history results", () => {
    expect(
      getRecruitmentResultTier3CountFromPickupHistory({
        result: [
          { trial: 10, tier3Count: 2, tier3StudentIds: [] },
          { trial: 20, tier3Count: 1, tier3StudentIds: ["hina"] },
        ],
      }),
    ).toBe(3);
  });

  it("uses explicit tier3 count for stats when student names are omitted", () => {
    expect(
      getRecruitmentResultCountStats(
        {
          recruitedStudents: [],
          tier3Count: 4,
          trial: 100,
        },
        {},
      ),
    ).toMatchObject({
      tier3Count: 4,
      tier3DrawCount: 4,
      tier3RateCount: 4,
      pickupCount: 0,
    });
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

  it("appends a completed student without deduplicating existing recruited students", () => {
    expect(
      appendRecruitmentResultStudent(
        [
          { studentUid: "hina", tier: 3, pickup: false },
          { studentUid: "hina", tier: 3, pickup: false },
        ],
        { studentUid: "aru", tier: 3, pickup: true },
      ),
    ).toEqual([
      { studentUid: "hina", tier: 3, pickup: false },
      { studentUid: "hina", tier: 3, pickup: false },
      { studentUid: "aru", tier: 3, pickup: true },
    ]);
  });

  it("appends a tier3 pickup after an existing given student without rewriting the given record", () => {
    expect(
      appendRecruitmentResultStudent([{ studentUid: "toki-armed", tier: 1, pickup: false }], {
        studentUid: "himari-armed",
        tier: 3,
        pickup: true,
      }),
    ).toEqual([
      { studentUid: "toki-armed", tier: 1, pickup: false },
      { studentUid: "himari-armed", tier: 3, pickup: true },
    ]);
  });

  it("preserves existing non-tier3 students when saving editable tier3 pickup history", () => {
    expect(
      mergeEditableRecruitmentResultStudents({
        existingStudents: [
          { studentUid: "toki-armed", tier: 3, pickup: true },
          { studentUid: "hina", tier: 3, pickup: false },
          { studentUid: "hina", tier: 3, pickup: false },
        ],
        history: {
          result: [{ trial: 80, tier3Count: 2, tier3StudentIds: ["aru", "aru"] }],
        },
        lookup: {
          group: {
            recruitmentType: RecruitmentTypeEnum.Usual,
            recruitments: [
              {
                pickup: true,
                recruitmentType: RecruitmentTypeEnum.Given,
                student: { uid: "toki-armed", name: "토키(무장)", initialTier: 1 },
              },
            ],
          },
        },
      }),
    ).toEqual([
      { studentUid: "toki-armed", tier: 1, pickup: false },
      { studentUid: "aru", tier: 3, pickup: false },
      { studentUid: "aru", tier: 3, pickup: false },
    ]);
  });

  it("preserves duplicate existing non-tier3 students when saving editable tier3 pickup history", () => {
    expect(
      mergeEditableRecruitmentResultStudents({
        existingStudents: [
          { studentUid: "toki-armed", tier: 3, pickup: true },
          { studentUid: "toki-armed", tier: 3, pickup: true },
        ],
        history: {
          result: [{ trial: 80, tier3Count: 1, tier3StudentIds: ["aru"] }],
        },
        lookup: {
          group: {
            recruitmentType: RecruitmentTypeEnum.Usual,
            recruitments: [
              {
                pickup: true,
                recruitmentType: RecruitmentTypeEnum.Given,
                student: { uid: "toki-armed", name: "토키(무장)", initialTier: 1 },
              },
            ],
          },
        },
      }),
    ).toEqual([
      { studentUid: "toki-armed", tier: 1, pickup: false },
      { studentUid: "toki-armed", tier: 1, pickup: false },
      { studentUid: "aru", tier: 3, pickup: false },
    ]);
  });

  it("removes only one target completed student occurrence", () => {
    expect(
      removeRecruitmentResultStudent(
        [
          { studentUid: "hina", tier: 3, pickup: true },
          { studentUid: "hina", tier: 3, pickup: true },
          { studentUid: "aru", tier: 4, pickup: false },
        ],
        "hina",
      ),
    ).toEqual([
      { studentUid: "hina", tier: 3, pickup: true },
      { studentUid: "aru", tier: 4, pickup: false },
    ]);
  });
});
