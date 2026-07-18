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
  {
    uid: "next-elimination",
    raidType: "elimination",
    startAt: "2026-07-28T00:00:00.000Z",
    endAt: "2026-08-04T00:00:00.000Z",
  },
  {
    uid: "next-unlimit",
    raidType: "unlimit",
    startAt: "2026-07-24T00:00:00.000Z",
    endAt: "2026-07-31T00:00:00.000Z",
  },
];

describe("findCurrentOrClosestRaidSchedule", () => {
  it("prefers the most recently started ongoing total or grand assault", () => {
    expect(findCurrentOrClosestRaidSchedule(schedules, "2026-07-17T00:00:00.000Z")?.uid).toBe("ongoing-elimination");
  });

  it("uses the nearest upcoming total or grand assault regardless of type", () => {
    expect(findCurrentOrClosestRaidSchedule(schedules, "2026-07-25T00:00:00.000Z")?.uid).toBe("next-elimination");
  });

  it("ignores other raid types", () => {
    expect(findCurrentOrClosestRaidSchedule(schedules, "2026-07-24T00:00:00.000Z")?.uid).toBe("next-elimination");
  });

  it("falls back to the most recently completed total or grand assault", () => {
    expect(findCurrentOrClosestRaidSchedule(schedules, "2026-08-20T00:00:00.000Z")?.uid).toBe("next-total-assault");
  });
});
