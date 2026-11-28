import { describe, expect, it } from "@jest/globals";
import {
  createRaidRowScheduleResolver,
  findGlScheduleOfJpSeason,
  toForecastRaidSchedule,
  toGlRaidBossUid,
} from "~/domain/raid-season-resolution";
import { toUtcIso } from "~/lib/date-time";
import {
  GL_TOTAL_ASSAULT_89,
  GL_TOTAL_ASSAULT_91,
  GL_UNLIMIT_31,
  JP_TOTAL_ASSAULT_92,
  JP_TOTAL_ASSAULT_94,
  JP_UNLIMIT_31,
  raidListItem,
} from "../../helpers/raid-season-fixtures";

const GL = [GL_TOTAL_ASSAULT_89, GL_UNLIMIT_31, GL_TOTAL_ASSAULT_91].map(raidListItem);
const JP = [JP_TOTAL_ASSAULT_92, JP_UNLIMIT_31, JP_TOTAL_ASSAULT_94].map(raidListItem);

type Season = { raidType: string | null; jpRaidSeasonIndex: number | null; glRaidSeasonIndex: number | null };

/** A raid row that has not ended, as the resolver reads it. */
const row = (
  uid: string,
  raidType: string | null,
  jpRaidSeasonIndex: number | null,
  glRaidSeasonIndex: number | null,
) => ({
  uid,
  raidSeason: { raidType, jpRaidSeasonIndex, glRaidSeasonIndex } satisfies Season,
});

/** Resolves one row that is also the only raid row that has not ended. */
const resolveAlone = (gl: typeof GL, jp: typeof JP, season: Season) => {
  const subject = { uid: "row", raidSeason: season };
  return createRaidRowScheduleResolver(gl, jp, [subject])(subject);
};

// BAQL after dropping the forecast `gl` schedules of JP total assault seasons 92 and 94.
const withoutForecasts = GL.filter((schedule) => schedule.raidType !== "total_assault");

describe("createRaidRowScheduleResolver", () => {
  it("resolves a row to the gl schedule whose JP schedule is the row's JP season", () => {
    const resolution = resolveAlone(GL, JP, {
      raidType: "total_assault",
      jpRaidSeasonIndex: 92,
      glRaidSeasonIndex: 89,
    });

    expect(resolution).toEqual({ kind: "gl", schedule: expect.objectContaining({ uid: "gl_total_assault_89" }) });
  });

  it("keeps the gl schedule even when the row's own season number disagrees with it", () => {
    expect(
      resolveAlone(GL, JP, { raidType: "total_assault", jpRaidSeasonIndex: 92, glRaidSeasonIndex: 88 }),
    ).toMatchObject({ kind: "gl", schedule: { uid: "gl_total_assault_89", seasonIndex: 89 } });
  });

  it("falls back to the JP schedule of the season with the row's season number when BAQL has no gl schedule", () => {
    expect(
      resolveAlone(withoutForecasts, JP, { raidType: "total_assault", jpRaidSeasonIndex: 92, glRaidSeasonIndex: 89 }),
    ).toEqual({
      kind: "jp",
      schedule: expect.objectContaining({ uid: "jp_total_assault_92" }),
      seasonIndex: 89,
    });
    expect(
      resolveAlone(withoutForecasts, JP, { raidType: "total_assault", jpRaidSeasonIndex: 92, glRaidSeasonIndex: null }),
    ).toEqual({ kind: "jp", schedule: expect.objectContaining({ uid: "jp_total_assault_92" }), seasonIndex: null });
  });

  it("matches the raid type too, never a season of another raid type with the same index", () => {
    expect(resolveAlone([], JP, { raidType: "elimination", jpRaidSeasonIndex: 31, glRaidSeasonIndex: 30 })).toEqual({
      kind: "unresolved",
    });
    expect(resolveAlone([], JP, { raidType: "unlimit", jpRaidSeasonIndex: 31, glRaidSeasonIndex: 30 })).toMatchObject({
      kind: "jp",
      schedule: { uid: "jp_unlimit_31" },
    });
  });

  it("leaves a row without a raid type or JP season to the caller", () => {
    expect(resolveAlone(GL, JP, { raidType: null, jpRaidSeasonIndex: null, glRaidSeasonIndex: null })).toEqual({
      kind: "unlinked",
    });
    expect(resolveAlone(GL, JP, { raidType: "total_assault", jpRaidSeasonIndex: null, glRaidSeasonIndex: 89 })).toEqual(
      {
        kind: "unlinked",
      },
    );
  });

  it("chooses nothing when several schedules claim the season", () => {
    const duplicateGl = { ...GL[0], uid: "gl_total_assault_90" };
    const duplicateJp = { ...JP[0], uid: "jp_total_assault_92_copy" };
    const season = { raidType: "total_assault", jpRaidSeasonIndex: 92, glRaidSeasonIndex: 89 };

    expect(resolveAlone([...GL, duplicateGl], JP, season)).toEqual({ kind: "unresolved" });
    expect(resolveAlone([], [...JP, duplicateJp], season)).toEqual({ kind: "unresolved" });
  });
});

describe("forecast season numbers", () => {
  it("gives a forecast season the number no gl season of its raid type has and no other forecast season claims", () => {
    const forecast = row("a", "total_assault", 92, 89);
    const unnumbered = row("b", "total_assault", 94, null);
    const elimination = row("c", "elimination", 31, 89);
    const resolve = createRaidRowScheduleResolver(withoutForecasts, JP, [forecast, unnumbered, elimination]);

    expect(resolve(forecast)).toMatchObject({ kind: "jp", seasonIndex: 89 });
    expect(resolve(unnumbered)).toMatchObject({ kind: "jp", seasonIndex: null });
  });

  it("resolves a forecast season whose number a gl season of its raid type has as if the row had no number", () => {
    // BAQL lists an official #89 that belongs to another JP season than the one the row predicted for #89.
    const officialGl89 = {
      ...raidListItem(GL_TOTAL_ASSAULT_89),
      jpSchedule: { ...JP[0].jpSchedule, uid: "jp_x", seasonIndex: 95, startAt: JP[0].startAt },
    };
    const forecast = row("a", "total_assault", 94, 89);

    expect(createRaidRowScheduleResolver([officialGl89], JP, [forecast])(forecast)).toEqual({
      kind: "jp",
      schedule: expect.objectContaining({ uid: "jp_total_assault_94" }),
      seasonIndex: null,
    });
  });

  it("gives a number two forecast seasons claim to neither", () => {
    const first = row("a", "total_assault", 92, 90);
    const second = row("b", "total_assault", 94, 90);
    const resolve = createRaidRowScheduleResolver(withoutForecasts, JP, [first, second]);

    expect(resolve(first)).toMatchObject({ kind: "jp", seasonIndex: null });
    expect(resolve(second)).toMatchObject({ kind: "jp", seasonIndex: null });
  });

  it("gives no number to a forecast season of a row that has ended", () => {
    const ended = row("ended", "total_assault", 92, 89);

    expect(createRaidRowScheduleResolver(withoutForecasts, JP, [])(ended)).toMatchObject({
      kind: "jp",
      seasonIndex: null,
    });
  });
});

describe("findGlScheduleOfJpSeason", () => {
  it("finds the gl schedule of a JP season by raid type and JP season index, and none when several claim it", () => {
    expect(findGlScheduleOfJpSeason(GL, "total_assault", 92)).toMatchObject({ uid: "gl_total_assault_89" });
    expect(findGlScheduleOfJpSeason(GL, "elimination", 92)).toBeNull();
    expect(findGlScheduleOfJpSeason([...GL, { ...GL[0], uid: "copy" }], "total_assault", 92)).toBeNull();
  });
});

describe("toForecastRaidSchedule", () => {
  it("shows the JP schedule's data with the row's dates and season number, pointing to the JP schedule", () => {
    const row = { startAt: toUtcIso("2027-01-13T02:00:00Z"), endAt: toUtcIso("2027-02-15T19:00:00Z") };

    expect(toForecastRaidSchedule(raidListItem(JP_UNLIMIT_31), row, 31)).toEqual({
      ...raidListItem(JP_UNLIMIT_31),
      region: "gl",
      seasonIndex: 31,
      startAt: row.startAt,
      endAt: row.endAt,
      jpSchedule: { uid: "jp_unlimit_31", seasonIndex: 31, startAt: toUtcIso("2026-09-24T02:00:00Z") },
    });
  });

  it("gives the boss the gl spelling of its uid", () => {
    const row = { startAt: toUtcIso("2027-02-16T02:00:00Z"), endAt: toUtcIso("2027-02-22T19:00:00Z") };

    const forecast = toForecastRaidSchedule(raidListItem(JP_TOTAL_ASSAULT_94), row, 91);

    expect(forecast.raidBoss).toEqual(raidListItem(GL_TOTAL_ASSAULT_91).raidBoss);
    expect(toGlRaidBossUid("perorodzilla")).toBe("perorodzilla");
  });

  it("matches the gl forecast it replaces wherever BAQL's gl forecast agrees with its JP season", () => {
    const glItem = raidListItem(GL_TOTAL_ASSAULT_89);
    const forecast = toForecastRaidSchedule(
      raidListItem(JP_TOTAL_ASSAULT_92),
      { startAt: toUtcIso(GL_TOTAL_ASSAULT_89.startAt), endAt: glItem.endAt },
      89,
    );

    expect({ ...forecast, uid: glItem.uid }).toEqual(glItem);
  });
});
