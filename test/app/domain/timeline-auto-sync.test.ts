import { describe, expect, it } from "@jest/globals";
import {
  planTimelineAutoSync,
  type TimelineAutoSyncCandidate,
  type TimelineAutoSyncExistingRow,
} from "~/domain/timeline-auto-sync";
import { toUtcIso } from "~/lib/date-time";

const NOW = toUtcIso("2026-11-02T00:00:00Z");

function candidate(overrides: Partial<TimelineAutoSyncCandidate> = {}): TimelineAutoSyncCandidate {
  return {
    uid: "campaign-20261103",
    contentType: "campaign",
    contentUid: "20261103",
    runType: "first",
    occurrence: null,
    nameI18n: { ko: "임무(Normal) 보상량 2배" },
    startAt: toUtcIso("2026-11-02T19:00:00Z"),
    contentEndAt: toUtcIso("2026-11-09T19:00:00Z"),
    confirmed: true,
    ...overrides,
  };
}

function row(overrides: Partial<TimelineAutoSyncExistingRow> = {}): TimelineAutoSyncExistingRow {
  return {
    uid: "campaign-20261103",
    contentType: "campaign",
    contentUid: "20261103",
    startAt: toUtcIso("2026-11-02T19:00:00Z"),
    endAt: toUtcIso("2026-11-09T19:00:00Z"),
    endless: false,
    ...overrides,
  };
}

describe("planTimelineAutoSync", () => {
  it("creates a confirmed row whose end is the content end when none exists", () => {
    const plan = planTimelineAutoSync("campaign", [candidate()], [], NOW);

    expect(plan.creates).toEqual([
      expect.objectContaining({
        uid: "campaign-20261103",
        confirmed: true,
        endAt: toUtcIso("2026-11-09T19:00:00Z"),
        endless: false,
      }),
    ]);
    expect(plan.creates[0]).not.toHaveProperty("contentEndAt");
    expect(plan.updates).toEqual([]);
  });

  it("does nothing when the schedule already matches, even across instant spellings", () => {
    const plan = planTimelineAutoSync(
      "campaign",
      [candidate()],
      [row({ startAt: toUtcIso("2026-11-02T19:00:00.000Z") })],
      NOW,
    );

    expect(plan).toEqual({ creates: [], updates: [], conflictUids: [], missingUids: [] });
  });

  it("follows the source schedule on a non-endless row", () => {
    const plan = planTimelineAutoSync(
      "campaign",
      [candidate({ contentEndAt: toUtcIso("2026-11-10T19:00:00Z") })],
      [row()],
      NOW,
    );

    expect(plan.updates).toEqual([
      {
        uid: "campaign-20261103",
        startAt: toUtcIso("2026-11-02T19:00:00Z"),
        endAt: toUtcIso("2026-11-10T19:00:00Z"),
        endless: false,
      },
    ]);
  });

  it("never writes the content end into an endless row's exposure end", () => {
    const unchanged = planTimelineAutoSync(
      "campaign",
      [candidate()],
      [row({ endless: true, endAt: toUtcIso("2026-12-31T19:00:00Z") })],
      NOW,
    );
    expect(unchanged.updates).toEqual([]);

    const shifted = planTimelineAutoSync(
      "campaign",
      [candidate({ startAt: toUtcIso("2026-11-03T19:00:00Z") })],
      [row({ endless: true, endAt: toUtcIso("2026-12-31T19:00:00Z") })],
      NOW,
    );
    expect(shifted.updates).toEqual([
      {
        uid: "campaign-20261103",
        startAt: toUtcIso("2026-11-03T19:00:00Z"),
        endAt: new Date("2027-01-01T19:00:00Z").toISOString(),
        endless: true,
      },
    ]);
  });

  it("leaves a uid held by a different content alone and reports it", () => {
    const plan = planTimelineAutoSync("campaign", [candidate()], [row({ contentType: "event" })], NOW);

    expect(plan.conflictUids).toEqual(["campaign-20261103"]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
  });

  it("reports only future source-linked rows of the type that the source dropped", () => {
    const plan = planTimelineAutoSync(
      "campaign",
      [],
      [
        row({ uid: "campaign-dropped" }),
        row({ uid: "campaign-started", startAt: toUtcIso("2026-11-01T00:00:00Z") }),
        row({ uid: "campaign-manual", contentUid: null }),
        row({ uid: "event-other", contentType: "event" }),
      ],
      NOW,
    );

    expect(plan.missingUids).toEqual(["campaign-dropped"]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
  });
});
