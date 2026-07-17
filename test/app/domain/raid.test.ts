import { describe, expect, it } from "@jest/globals";
import { findCurrentOrClosestRaidSchedule } from "../../../app/domain/raid";

type TestSchedule = {
  uid: string;
  raidType: string;
  startAt: string;
  endAt: string;
};

const schedules: TestSchedule[] = [
  {
    uid: "past-total-assault",
    raidType: "total_assault",
    startAt: "2026-07-01T00:00:00.000Z",
    endAt: "2026-07-08T00:00:00.000Z",
  },
  {
    uid: "ongoing-total-assault",
    raidType: "total_assault",
    startAt: "2026-07-15T00:00:00.000Z",
    endAt: "2026-07-22T00:00:00.000Z",
  },
  {
    uid: "next-total-assault",
    raidType: "total_assault",
    startAt: "2026-08-01T00:00:00.000Z",
    endAt: "2026-08-08T00:00:00.000Z",
  },
  {
    uid: "ongoing-elimination",
    raidType: "elimination",
    startAt: "2026-07-16T00:00:00.000Z",
    endAt: "2026-07-23T00:00:00.000Z",
  },
];

describe("findCurrentOrClosestRaidSchedule", () => {
  it("prefers an ongoing schedule of the requested raid type", () => {
    expect(findCurrentOrClosestRaidSchedule(schedules, "total_assault", "2026-07-17T00:00:00.000Z")?.uid).toBe(
      "ongoing-total-assault",
    );
  });

  it("uses the next schedule when none is ongoing", () => {
    expect(findCurrentOrClosestRaidSchedule(schedules, "total_assault", "2026-07-25T00:00:00.000Z")?.uid).toBe(
      "next-total-assault",
    );
  });

  it("falls back to the most recently completed schedule", () => {
    expect(findCurrentOrClosestRaidSchedule(schedules, "total_assault", "2026-08-20T00:00:00.000Z")?.uid).toBe(
      "next-total-assault",
    );
  });
});
