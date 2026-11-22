import { describe, expect, it } from "@jest/globals";
import {
  appendRecruitmentResultStudent,
  createRecruitmentResultStudentsFromPickupHistory,
  getRecruitmentResultCountStats,
  getRecruitmentResultTier3CountFromPickupHistory,
  getRecruitmentResultTrialFromPickupHistory,
  isValidOffPickupSelection,
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

  describe("픽업 외 choice", () => {
    const group = {
      recruitmentType: RecruitmentTypeEnum.Usual,
      recruitments: [
        { pickup: true, recruitmentType: "usual", student: { uid: "neru", name: "네루(교복)", initialTier: 3 } },
        { pickup: true, recruitmentType: "usual", student: { uid: "iroha", name: "이로하(수영복)", initialTier: 3 } },
      ],
    };

    it("stores the choice on that draw only, so one of two draws of a student can be 픽업 외", () => {
      const students = createRecruitmentResultStudentsFromPickupHistory(
        {
          result: [
            {
              trial: 400,
              tier3Count: 3,
              tier3StudentIds: ["neru", "hina", "neru"],
              tier3StudentOffPickup: [false, false, true],
            },
          ],
        },
        new Set(["neru", "iroha"]),
      );

      expect(students).toEqual([
        { studentUid: "neru", tier: 3, pickup: true },
        { studentUid: "hina", tier: 3, pickup: false },
        { studentUid: "neru", tier: 3, pickup: false, offPickup: true },
      ]);
    });

    it("ignores the choice on a student that is not a pickup student of the group", () => {
      expect(
        createRecruitmentResultStudentsFromPickupHistory(
          { result: [{ trial: 10, tier3Count: 1, tier3StudentIds: ["hina"], tier3StudentOffPickup: [true] }] },
          new Set(["neru"]),
        ),
      ).toEqual([{ studentUid: "hina", tier: 3, pickup: false }]);
    });

    it("keeps the flag through sanitizing and drops anything but true", () => {
      expect(
        sanitizeRecruitmentResultStudents([
          { studentUid: "neru", tier: 3, pickup: true, offPickup: true },
          { studentUid: "iroha", tier: 3, pickup: true, offPickup: false as unknown as true },
        ]),
      ).toEqual([
        { studentUid: "neru", tier: 3, pickup: false, offPickup: true },
        { studentUid: "iroha", tier: 3, pickup: true },
      ]);
    });

    it("leaves a 픽업 외 student out of the pickup count only", () => {
      expect(
        getRecruitmentResultCountStats(
          {
            recruitedStudents: [
              { studentUid: "neru", tier: 3, pickup: true },
              { studentUid: "neru", tier: 3, pickup: false, offPickup: true },
              { studentUid: "iroha", tier: 3, pickup: true },
            ],
            tier3Count: null,
            trial: 400,
          },
          { group },
        ),
      ).toMatchObject({ tier3Count: 3, tier3RateCount: 3, pickupCount: 2, pickupRateCount: 2 });
    });

    it("counts a record saved before the choice existed as 픽업, as the group data says", () => {
      expect(
        getRecruitmentResultCountStats(
          { recruitedStudents: [{ studentUid: "neru", tier: 3, pickup: false }], tier3Count: null, trial: 10 },
          { group },
        ),
      ).toMatchObject({ pickupCount: 1 });
    });

    it("accepts choices only on pickup students, one per draw", () => {
      const pickups = new Set(["neru"]);
      expect(isValidOffPickupSelection({ tier3StudentIds: ["neru", "hina"] }, pickups)).toBe(true);
      expect(
        isValidOffPickupSelection({ tier3StudentIds: ["neru", "hina"], tier3StudentOffPickup: [true, false] }, pickups),
      ).toBe(true);
      expect(
        isValidOffPickupSelection({ tier3StudentIds: ["neru", "hina"], tier3StudentOffPickup: [false, true] }, pickups),
      ).toBe(false);
      expect(
        isValidOffPickupSelection({ tier3StudentIds: ["neru", "hina"], tier3StudentOffPickup: [true] }, pickups),
      ).toBe(false);
    });
  });
});
