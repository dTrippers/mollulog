import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_TIMELINE_AUTO_SYNC_UPDATE_POLICY,
  planTimelineAutoSync,
  type TimelineAutoSyncCandidate,
  type TimelineAutoSyncExistingRow,
} from "~/domain/timeline-auto-sync";
import { toUtcIso } from "~/lib/date-time";

const NOW = toUtcIso("2026-11-02T00:00:00Z");

function candidate(overrides: Partial<TimelineAutoSyncCandidate> = {}): TimelineAutoSyncCandidate {
  return {
    contentType: "campaign",
    contentUid: "20261103",
    runType: "first",
    occurrence: null,
    startAt: toUtcIso("2026-11-02T19:00:00Z"),
    contentEndAt: toUtcIso("2026-11-09T19:00:00Z"),
    create: { uid: "campaign-20261103", nameI18n: { ko: "임무(Normal) 보상량 2배" }, confirmed: true },
    ...overrides,
  };
}

function row(overrides: Partial<TimelineAutoSyncExistingRow> = {}): TimelineAutoSyncExistingRow {
  return {
    uid: "campaign-20261103",
    contentType: "campaign",
    contentUid: "20261103",
    runType: "first",
    occurrence: null,
    startAt: toUtcIso("2026-11-02T19:00:00Z"),
    endAt: toUtcIso("2026-11-09T19:00:00Z"),
    endless: false,
    raidType: null,
    jpRaidSeasonIndex: null,
    glRaidSeasonIndex: null,
    ...overrides,
  };
}

function raidCandidate(overrides: Partial<TimelineAutoSyncCandidate> = {}): TimelineAutoSyncCandidate {
  return candidate({
    contentType: "raid",
    contentUid: "gl_unlimit_30",
    startAt: toUtcIso("2026-12-16T02:00:00Z"),
    contentEndAt: toUtcIso("2027-01-11T19:00:00Z"),
    create: { uid: "gl_unlimit_30", nameI18n: { ko: "호크마" }, confirmed: false },
    jpRaidSeason: { raidType: "unlimit", seasonIndex: 30 },
    glRaidSeasonIndex: 30,
    ...overrides,
  });
}

function raidRow(overrides: Partial<TimelineAutoSyncExistingRow> = {}): TimelineAutoSyncExistingRow {
  return row({
    uid: "unlimit_30",
    contentType: "raid",
    contentUid: "gl_unlimit_30",
    startAt: toUtcIso("2026-12-16T02:00:00Z"),
    endAt: toUtcIso("2027-01-11T19:00:00Z"),
    raidType: "unlimit",
    jpRaidSeasonIndex: 30,
    glRaidSeasonIndex: 30,
    ...overrides,
  });
}

const RAID_POLICY = { updateStartedRows: false, keepOwnEndWithoutSourceEnd: true, matchBy: "jpRaidSeason" } as const;

function eventCandidate(overrides: Partial<TimelineAutoSyncCandidate> = {}): TimelineAutoSyncCandidate {
  return candidate({ contentType: "event", contentUid: "844", runType: "rerun", create: null, ...overrides });
}

function eventRow(overrides: Partial<TimelineAutoSyncExistingRow> = {}): TimelineAutoSyncExistingRow {
  return row({ uid: "pandemic-hazard-rerun", contentType: "event", contentUid: "844", runType: "rerun", ...overrides });
}

describe("planTimelineAutoSync", () => {
  it("creates a row whose end is the content end when no row shows the content", () => {
    const plan = planTimelineAutoSync("campaign", [candidate()], [], NOW);

    expect(plan.creates).toEqual([
      {
        uid: "campaign-20261103",
        contentType: "campaign",
        contentUid: "20261103",
        runType: "first",
        occurrence: null,
        nameI18n: { ko: "임무(Normal) 보상량 2배" },
        confirmed: true,
        startAt: toUtcIso("2026-11-02T19:00:00Z"),
        endAt: toUtcIso("2026-11-09T19:00:00Z"),
        endless: false,
        raidType: null,
        jpRaidSeasonIndex: null,
        glRaidSeasonIndex: null,
      },
    ]);
    expect(plan.updates).toEqual([]);
  });

  it("does nothing when the schedule already matches, even across instant spellings", () => {
    const plan = planTimelineAutoSync(
      "campaign",
      [candidate()],
      [row({ startAt: toUtcIso("2026-11-02T19:00:00.000Z") })],
      NOW,
    );

    expect(plan).toEqual({
      updateStartedRows: false,
      matchBy: "content",
      creates: [],
      updates: [],
      conflictUids: [],
      duplicateUids: [],
      missingUids: [],
      withoutJpRaidSeasonContentUids: [],
      unlinkedUids: [],
      ambiguousJpRaidSeasonContentUids: [],
    });
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
        match: expect.any(Object),
        readSchedule: expect.any(Object),
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
        match: expect.any(Object),
        readSchedule: expect.any(Object),
        startAt: toUtcIso("2026-11-03T19:00:00Z"),
        endAt: new Date("2027-01-01T19:00:00Z").toISOString(),
        endless: true,
      },
    ]);
  });

  it("keeps a row's own end when the source knows no end", () => {
    const plan = planTimelineAutoSync(
      "event",
      [
        candidate({
          contentType: "event",
          startAt: toUtcIso("2026-11-03T19:00:00Z"),
          contentEndAt: null,
          create: null,
        }),
      ],
      [row({ contentType: "event" })],
      NOW,
    );

    expect(plan.updates).toEqual([
      {
        uid: "campaign-20261103",
        match: expect.any(Object),
        readSchedule: expect.any(Object),
        startAt: toUtcIso("2026-11-03T19:00:00Z"),
        endAt: new Date("2026-11-10T19:00:00Z").toISOString(),
        endless: false,
      },
    ]);
  });

  it("matches a row by its content, not by its irregular uid", () => {
    const plan = planTimelineAutoSync(
      "event",
      [eventCandidate({ startAt: toUtcIso("2026-11-03T19:00:00Z"), contentEndAt: toUtcIso("2026-11-10T19:00:00Z") })],
      [eventRow()],
      NOW,
    );

    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([
      {
        uid: "pandemic-hazard-rerun",
        match: { kind: "content", contentType: "event", contentUid: "844", runType: "rerun", occurrence: null },
        readSchedule: {
          startAt: toUtcIso("2026-11-02T19:00:00Z"),
          endAt: toUtcIso("2026-11-09T19:00:00Z"),
          endless: false,
        },
        startAt: toUtcIso("2026-11-03T19:00:00Z"),
        endAt: toUtcIso("2026-11-10T19:00:00Z"),
        endless: false,
      },
    ]);
  });

  it("matches on run type and occurrence as part of the content", () => {
    const plan = planTimelineAutoSync(
      "event",
      [candidate({ contentType: "event", contentUid: "844", runType: "rerun", occurrence: 2, create: null })],
      [
        row({ uid: "first-run", contentType: "event", contentUid: "844", runType: "first", occurrence: 2 }),
        row({ uid: "other-occurrence", contentType: "event", contentUid: "844", runType: "rerun", occurrence: 1 }),
      ],
      NOW,
    );

    expect(plan.updates).toEqual([]);
    expect(plan.creates).toEqual([]);
    expect(plan.missingUids).toEqual(["first-run", "other-occurrence"]);
  });

  it("never changes confirmed on an existing row", () => {
    const plan = planTimelineAutoSync(
      "event",
      [eventCandidate({ startAt: toUtcIso("2026-11-03T19:00:00Z") })],
      [eventRow()],
      NOW,
    );

    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).not.toHaveProperty("confirmed");
  });

  it("leaves every row sharing one content key alone and reports them", () => {
    const plan = planTimelineAutoSync(
      "event",
      [eventCandidate({ startAt: toUtcIso("2026-11-03T19:00:00Z") })],
      [eventRow(), eventRow({ uid: "pandemic-hazard-rerun-copy" })],
      NOW,
    );

    expect(plan.duplicateUids).toEqual(["pandemic-hazard-rerun", "pandemic-hazard-rerun-copy"]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.missingUids).toEqual([]);
  });

  it("never touches a past or ongoing row, and never creates a second row for its content", () => {
    const plan = planTimelineAutoSync(
      "campaign",
      [candidate({ contentEndAt: toUtcIso("2026-11-10T19:00:00Z") })],
      [row({ startAt: toUtcIso("2026-11-01T19:00:00Z") })],
      NOW,
    );

    expect(plan).toEqual({
      updateStartedRows: false,
      matchBy: "content",
      creates: [],
      updates: [],
      conflictUids: [],
      duplicateUids: [],
      missingUids: [],
      withoutJpRaidSeasonContentUids: [],
      unlinkedUids: [],
      ambiguousJpRaidSeasonContentUids: [],
    });
  });

  it("creates nothing for a candidate that may only update", () => {
    const plan = planTimelineAutoSync("event", [candidate({ contentType: "event", create: null })], [], NOW);

    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
  });

  it("leaves a uid held by a different content alone and reports it", () => {
    const plan = planTimelineAutoSync("campaign", [candidate()], [row({ contentType: "event" })], NOW);

    expect(plan.conflictUids).toEqual(["campaign-20261103"]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
  });

  it("reports only future source-linked rows of the type that the source does not list, and changes none", () => {
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

  describe("raids, matched by JP season", () => {
    it("finds a row by its JP season, not by its GL uid, and copies the GL uid BAQL issued", () => {
      const plan = planTimelineAutoSync(
        "raid",
        [raidCandidate({ startAt: toUtcIso("2026-12-17T02:00:00Z"), contentEndAt: toUtcIso("2027-01-12T19:00:00Z") })],
        [raidRow({ contentUid: "gl_unlimit_29" })],
        NOW,
        RAID_POLICY,
      );

      expect(plan.creates).toEqual([]);
      expect(plan.updates).toEqual([
        {
          uid: "unlimit_30",
          match: { kind: "jpRaidSeason", contentType: "raid", raidType: "unlimit", seasonIndex: 30 },
          readSchedule: {
            startAt: toUtcIso("2026-12-16T02:00:00Z"),
            endAt: toUtcIso("2027-01-11T19:00:00Z"),
            endless: false,
          },
          startAt: toUtcIso("2026-12-17T02:00:00Z"),
          endAt: toUtcIso("2027-01-12T19:00:00Z"),
          endless: false,
          contentUid: "gl_unlimit_30",
        },
      ]);
      expect(plan.updates[0]).not.toHaveProperty("confirmed");
    });

    it("corrects only the GL uid when the dates already match", () => {
      const plan = planTimelineAutoSync(
        "raid",
        [raidCandidate()],
        [raidRow({ contentUid: "gl_unlimit_29" })],
        NOW,
        RAID_POLICY,
      );

      expect(plan.updates).toEqual([
        {
          uid: "unlimit_30",
          match: expect.any(Object),
          readSchedule: expect.any(Object),
          startAt: toUtcIso("2026-12-16T02:00:00Z"),
          endAt: toUtcIso("2027-01-11T19:00:00Z"),
          endless: false,
          contentUid: "gl_unlimit_30",
        },
      ]);
      expect(planTimelineAutoSync("raid", [raidCandidate()], [raidRow()], NOW, RAID_POLICY).updates).toEqual([]);
    });

    it("never matches by content uid: a row with the same GL uid but another JP season is a different season", () => {
      const plan = planTimelineAutoSync(
        "raid",
        [raidCandidate()],
        [raidRow({ uid: "other-season", jpRaidSeasonIndex: 29 })],
        NOW,
        RAID_POLICY,
      );

      expect(plan.updates).toEqual([]);
      expect(plan.missingUids).toEqual(["other-season"]);
      expect(plan.creates.map((create) => create.uid)).toEqual(["gl_unlimit_30"]);
    });

    it("creates a row for an unmatched JP season with both JP columns filled", () => {
      const plan = planTimelineAutoSync("raid", [raidCandidate()], [], NOW, RAID_POLICY);

      expect(plan.creates).toEqual([
        {
          uid: "gl_unlimit_30",
          contentType: "raid",
          contentUid: "gl_unlimit_30",
          runType: "first",
          occurrence: null,
          nameI18n: { ko: "호크마" },
          confirmed: false,
          startAt: toUtcIso("2026-12-16T02:00:00Z"),
          endAt: toUtcIso("2027-01-11T19:00:00Z"),
          endless: false,
          raidType: "unlimit",
          jpRaidSeasonIndex: 30,
          glRaidSeasonIndex: 30,
        },
      ]);
    });

    it("copies the GL season number into a future row whose number differs or is missing, and only then", () => {
      const update = (glRaidSeasonIndex: number | null) =>
        planTimelineAutoSync("raid", [raidCandidate()], [raidRow({ glRaidSeasonIndex })], NOW, RAID_POLICY).updates;

      expect(update(null)).toEqual([
        {
          uid: "unlimit_30",
          match: { kind: "jpRaidSeason", contentType: "raid", raidType: "unlimit", seasonIndex: 30 },
          readSchedule: {
            startAt: toUtcIso("2026-12-16T02:00:00Z"),
            endAt: toUtcIso("2027-01-11T19:00:00Z"),
            endless: false,
          },
          startAt: toUtcIso("2026-12-16T02:00:00Z"),
          endAt: toUtcIso("2027-01-11T19:00:00Z"),
          endless: false,
          glRaidSeasonIndex: 30,
        },
      ]);
      expect(update(29)).toEqual([expect.objectContaining({ uid: "unlimit_30", glRaidSeasonIndex: 30 })]);
      expect(update(30)).toEqual([]);
    });

    it("never writes the GL season number into a started row", () => {
      const plan = planTimelineAutoSync(
        "raid",
        [raidCandidate({ startAt: toUtcIso("2026-10-01T02:00:00Z") })],
        [raidRow({ startAt: toUtcIso("2026-10-01T02:00:00Z"), glRaidSeasonIndex: null })],
        NOW,
        RAID_POLICY,
      );

      expect(plan.updates).toEqual([]);
    });

    it("leaves the GL season number alone for a candidate that carries none", () => {
      const { glRaidSeasonIndex: _omitted, ...withoutNumber } = raidCandidate();
      const plan = planTimelineAutoSync(
        "raid",
        [withoutNumber],
        [raidRow({ glRaidSeasonIndex: null })],
        NOW,
        RAID_POLICY,
      );

      expect(plan.updates).toEqual([]);
    });

    it("creates nothing while a future raid row has no JP season, but still updates matched rows", () => {
      const plan = planTimelineAutoSync(
        "raid",
        [
          raidCandidate({ startAt: toUtcIso("2026-12-17T02:00:00Z") }),
          raidCandidate({
            contentUid: "gl_unlimit_31",
            jpRaidSeason: { raidType: "unlimit", seasonIndex: 31 },
            create: { uid: "gl_unlimit_31", nameI18n: { ko: "티페레트" }, confirmed: false },
          }),
        ],
        [
          raidRow(),
          raidRow({ uid: "unlimit_31", contentUid: "gl_unlimit_31", raidType: null, jpRaidSeasonIndex: null }),
          raidRow({
            uid: "past-unlinked",
            startAt: toUtcIso("2026-10-01T02:00:00Z"),
            raidType: null,
            jpRaidSeasonIndex: null,
          }),
        ],
        NOW,
        RAID_POLICY,
      );

      expect(plan.unlinkedUids).toEqual(["unlimit_31"]);
      expect(plan.creates).toEqual([]);
      expect(plan.updates.map((update) => update.uid)).toEqual(["unlimit_30"]);
      expect(plan.missingUids).toEqual([]);
    });

    it("lets a past row without a JP season not block creation", () => {
      const plan = planTimelineAutoSync(
        "raid",
        [raidCandidate()],
        [
          raidRow({
            uid: "past",
            startAt: toUtcIso("2026-10-01T02:00:00Z"),
            raidType: null,
            jpRaidSeasonIndex: null,
          }),
        ],
        NOW,
        RAID_POLICY,
      );

      expect(plan.unlinkedUids).toEqual([]);
      expect(plan.creates.map((create) => create.uid)).toEqual(["gl_unlimit_30"]);
    });

    it("leaves every future row sharing one JP season alone and reports them", () => {
      const plan = planTimelineAutoSync(
        "raid",
        [raidCandidate({ startAt: toUtcIso("2026-12-17T02:00:00Z") })],
        [raidRow(), raidRow({ uid: "gl_unlimit_30", contentUid: "gl_unlimit_29" })],
        NOW,
        RAID_POLICY,
      );

      expect(plan.duplicateUids).toEqual(["unlimit_30", "gl_unlimit_30"]);
      expect(plan.creates).toEqual([]);
      expect(plan.updates).toEqual([]);
      expect(plan.missingUids).toEqual([]);
    });

    it("writes nothing for a JP season that several GL schedules refer to, and reports them", () => {
      const sameSeason = raidCandidate({
        contentUid: "gl_unlimit_31",
        create: { uid: "raid-b", nameI18n: { ko: "호크마" }, confirmed: false },
      });
      const withRow = planTimelineAutoSync(
        "raid",
        [raidCandidate({ startAt: toUtcIso("2026-12-17T02:00:00Z") }), sameSeason],
        [raidRow()],
        NOW,
        RAID_POLICY,
      );
      expect(withRow.ambiguousJpRaidSeasonContentUids).toEqual(["gl_unlimit_30", "gl_unlimit_31"]);
      expect(withRow.updates).toEqual([]);
      expect(withRow.creates).toEqual([]);
      expect(withRow.missingUids).toEqual([]);

      const withoutRow = planTimelineAutoSync("raid", [raidCandidate(), sameSeason], [], NOW, RAID_POLICY);
      expect(withoutRow.ambiguousJpRaidSeasonContentUids).toEqual(["gl_unlimit_30", "gl_unlimit_31"]);
      expect(withoutRow.creates).toEqual([]);
    });

    it("decides ambiguity from every GL schedule BAQL returned, including one that is not a candidate", () => {
      const references = [
        { contentUid: "gl_unlimit_30", jpRaidSeason: { raidType: "unlimit", seasonIndex: 30 } },
        // A GL schedule without a start, which never becomes a candidate.
        { contentUid: "gl_unlimit_31", jpRaidSeason: { raidType: "unlimit", seasonIndex: 30 } },
      ];

      const plan = planTimelineAutoSync(
        "raid",
        [raidCandidate({ startAt: toUtcIso("2026-12-17T02:00:00Z") })],
        [raidRow()],
        NOW,
        RAID_POLICY,
        references,
      );

      expect(plan.ambiguousJpRaidSeasonContentUids).toEqual(["gl_unlimit_30", "gl_unlimit_31"]);
      expect(plan.updates).toEqual([]);
      expect(plan.creates).toEqual([]);
      expect(plan.missingUids).toEqual([]);

      const created = planTimelineAutoSync("raid", [raidCandidate()], [], NOW, RAID_POLICY, references);
      expect(created.creates).toEqual([]);
    });

    it("lets a started GL schedule update a row still dated in the future, but never a started row", () => {
      const started = raidCandidate({
        startAt: toUtcIso("2026-11-01T02:00:00Z"),
        contentEndAt: toUtcIso("2026-11-27T19:00:00Z"),
        create: null,
      });

      const future = planTimelineAutoSync("raid", [started], [raidRow()], NOW, RAID_POLICY);
      expect(future.updates).toEqual([
        {
          uid: "unlimit_30",
          startAt: toUtcIso("2026-11-01T02:00:00Z"),
          endAt: toUtcIso("2026-11-27T19:00:00Z"),
          endless: false,
          match: { kind: "jpRaidSeason", contentType: "raid", raidType: "unlimit", seasonIndex: 30 },
          readSchedule: {
            startAt: toUtcIso("2026-12-16T02:00:00Z"),
            endAt: toUtcIso("2027-01-11T19:00:00Z"),
            endless: false,
          },
        },
      ]);
      expect(planTimelineAutoSync("raid", [started], [], NOW, RAID_POLICY).creates).toEqual([]);
      expect(
        planTimelineAutoSync(
          "raid",
          [started],
          [raidRow({ startAt: toUtcIso("2026-11-01T02:00:00Z") })],
          NOW,
          RAID_POLICY,
        ).updates,
      ).toEqual([]);
    });

    it("writes nothing for a GL schedule without a JP schedule and reports it", () => {
      const plan = planTimelineAutoSync(
        "raid",
        [raidCandidate({ jpRaidSeason: null, startAt: toUtcIso("2026-12-17T02:00:00Z") })],
        [raidRow()],
        NOW,
        RAID_POLICY,
      );

      expect(plan.withoutJpRaidSeasonContentUids).toEqual(["gl_unlimit_30"]);
      expect(plan.creates).toEqual([]);
      expect(plan.updates).toEqual([]);
      expect(plan.missingUids).toEqual(["unlimit_30"]);
    });
  });

  describe("the update policy of campaigns and drills", () => {
    const STARTED_ROWS = { updateStartedRows: true, keepOwnEndWithoutSourceEnd: false, matchBy: "content" } as const;

    it("updates a matched row that has already started, such as a running campaign whose end changed", () => {
      const ongoing = row({ startAt: toUtcIso("2026-11-01T19:00:00Z") });
      const candidateWithNewEnd = candidate({
        startAt: toUtcIso("2026-11-01T19:00:00Z"),
        contentEndAt: toUtcIso("2026-11-12T19:00:00Z"),
      });

      const plan = planTimelineAutoSync("campaign", [candidateWithNewEnd], [ongoing], NOW, STARTED_ROWS);
      expect(plan.updateStartedRows).toBe(true);
      expect(plan.updates).toEqual([
        {
          uid: "campaign-20261103",
          match: expect.any(Object),
          readSchedule: expect.any(Object),
          startAt: toUtcIso("2026-11-01T19:00:00Z"),
          endAt: toUtcIso("2026-11-12T19:00:00Z"),
          endless: false,
        },
      ]);

      const defaultPlan = planTimelineAutoSync("campaign", [candidateWithNewEnd], [ongoing], NOW);
      expect(defaultPlan.updateStartedRows).toBe(false);
      expect(defaultPlan.updates).toEqual([]);
    });

    it("makes a non-endless row endless without an end when the source knows no end, as before", () => {
      const drillRow = row({ uid: "jfd-56", contentType: "joint_firing_drill", contentUid: "56" });
      const drillCandidate = candidate({ contentType: "joint_firing_drill", contentUid: "56", contentEndAt: null });

      expect(
        planTimelineAutoSync("joint_firing_drill", [drillCandidate], [drillRow], NOW, STARTED_ROWS).updates,
      ).toEqual([
        {
          uid: "jfd-56",
          startAt: toUtcIso("2026-11-02T19:00:00Z"),
          endAt: null,
          endless: true,
          match: {
            kind: "content",
            contentType: "joint_firing_drill",
            contentUid: "56",
            runType: "first",
            occurrence: null,
          },
          readSchedule: {
            startAt: toUtcIso("2026-11-02T19:00:00Z"),
            endAt: toUtcIso("2026-11-09T19:00:00Z"),
            endless: false,
          },
        },
      ]);
      expect(
        planTimelineAutoSync(
          "joint_firing_drill",
          [drillCandidate],
          [drillRow],
          NOW,
          DEFAULT_TIMELINE_AUTO_SYNC_UPDATE_POLICY,
        ).updates,
      ).toEqual([]);
    });

    it("still matches by content and creates rows as the source asks", () => {
      const plan = planTimelineAutoSync(
        "campaign",
        [
          candidate(),
          candidate({
            contentUid: "20261104",
            create: { uid: "campaign-20261104", nameI18n: { ko: "x" }, confirmed: true },
          }),
        ],
        [
          row({
            uid: "irregular-campaign-uid",
            startAt: toUtcIso("2026-11-01T19:00:00Z"),
            endAt: toUtcIso("2026-11-08T19:00:00Z"),
          }),
        ],
        NOW,
        STARTED_ROWS,
      );

      expect(plan.updates.map((update) => update.uid)).toEqual(["irregular-campaign-uid"]);
      expect(plan.creates.map((create) => create.uid)).toEqual(["campaign-20261104"]);
    });
  });

  describe("a source that knows only a release time", () => {
    function storyCandidate(startAt: string): TimelineAutoSyncCandidate {
      return candidate({
        contentType: "main_story",
        contentUid: "2-1-1-1",
        startAt: toUtcIso(startAt),
        contentEndAt: "release",
        create: null,
      });
    }

    it("moves an endless row with its own exposure length", () => {
      const plan = planTimelineAutoSync(
        "main_story",
        [storyCandidate("2026-12-02T02:00:00Z")],
        [
          row({
            uid: "mainstory-s2-vol1-1",
            contentType: "main_story",
            contentUid: "2-1-1-1",
            startAt: toUtcIso("2026-12-01T02:00:00Z"),
            endAt: toUtcIso("2026-12-08T02:00:00Z"),
            endless: true,
          }),
        ],
        NOW,
      );

      expect(plan.updates).toEqual([
        {
          uid: "mainstory-s2-vol1-1",
          match: expect.any(Object),
          readSchedule: expect.any(Object),
          startAt: toUtcIso("2026-12-02T02:00:00Z"),
          endAt: new Date("2026-12-09T02:00:00Z").toISOString(),
          endless: true,
        },
      ]);
    });

    it("keeps a non-endless row's end and length instead of clearing it", () => {
      const plan = planTimelineAutoSync(
        "mini_story",
        [{ ...storyCandidate("2026-12-09T02:00:00Z"), contentType: "mini_story", contentUid: "ibukis-runaway" }],
        [
          row({
            uid: "ibukis-runaway",
            contentType: "mini_story",
            contentUid: "ibukis-runaway",
            startAt: toUtcIso("2026-12-08T02:00:00Z"),
            endAt: toUtcIso("2026-12-15T02:00:00Z"),
            endless: false,
          }),
        ],
        NOW,
      );

      expect(plan.updates).toEqual([
        {
          uid: "ibukis-runaway",
          match: expect.any(Object),
          readSchedule: expect.any(Object),
          startAt: toUtcIso("2026-12-09T02:00:00Z"),
          endAt: new Date("2026-12-16T02:00:00Z").toISOString(),
          endless: false,
        },
      ]);
    });

    it("leaves the row alone when the release time is unchanged", () => {
      const plan = planTimelineAutoSync(
        "main_story",
        [storyCandidate("2026-12-01T02:00:00Z")],
        [
          row({
            uid: "mainstory-s2-vol1-1",
            contentType: "main_story",
            contentUid: "2-1-1-1",
            startAt: toUtcIso("2026-12-01T02:00:00Z"),
            endAt: toUtcIso("2026-12-08T02:00:00Z"),
            endless: true,
          }),
        ],
        NOW,
      );

      expect(plan.updates).toEqual([]);
    });
  });
});
