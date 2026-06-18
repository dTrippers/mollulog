import { describe, expect, it } from "@jest/globals";
import { Defense } from "~/graphql/graphql";
import type { UtcIsoString } from "~/lib/date-time";
import type { Terrain } from "~/models/content.d";
import { getRaidGroupKey, getRaidOccurrenceKey, getSameOccurrenceRaids } from "./raid-group";

type TestRaid = {
  uid: string;
  raidBoss: { uid: string };
  terrain: Terrain;
  startAt: UtcIsoString | null;
  jpSchedule: { seasonIndex: number } | null;
};

function makeRaid(overrides: Partial<TestRaid> & Pick<TestRaid, "uid">): TestRaid {
  return {
    raidBoss: { uid: "binah" },
    terrain: "outdoor",
    startAt: "2025-01-01T00:00:00.000Z" as UtcIsoString,
    jpSchedule: { seasonIndex: 1 },
    ...overrides,
  };
}

describe("getRaidOccurrenceKey", () => {
  it("combines boss uid and terrain", () => {
    expect(getRaidOccurrenceKey({ raidBoss: { uid: "binah" }, terrain: "outdoor" })).toBe("binah:outdoor");
  });

  it("distinguishes the same boss on different terrain", () => {
    expect(getRaidOccurrenceKey({ raidBoss: { uid: "binah" }, terrain: "indoor" })).not.toBe(
      getRaidOccurrenceKey({ raidBoss: { uid: "binah" }, terrain: "outdoor" }),
    );
  });
});

describe("getRaidGroupKey", () => {
  it("appends the defense type to the occurrence key", () => {
    expect(getRaidGroupKey({ raidBoss: { uid: "binah" }, terrain: "outdoor" }, Defense.Light)).toBe(
      "binah:outdoor:light",
    );
  });
});

describe("getSameOccurrenceRaids", () => {
  const current = makeRaid({ uid: "cur", startAt: "2025-06-01T00:00:00.000Z" as UtcIsoString });

  it("keeps only hostings with the same boss + terrain", () => {
    const all = [
      current,
      makeRaid({ uid: "same", startAt: "2025-01-01T00:00:00.000Z" as UtcIsoString }),
      makeRaid({ uid: "otherTerrain", terrain: "indoor" }),
      makeRaid({ uid: "otherBoss", raidBoss: { uid: "chesed" } }),
    ];
    expect(getSameOccurrenceRaids(all, current).map((raid) => raid.uid)).toEqual(["same"]);
  });

  it("excludes hostings without JP-server statistics", () => {
    const all = [current, makeRaid({ uid: "noJp", jpSchedule: null })];
    expect(getSameOccurrenceRaids(all, current)).toHaveLength(0);
  });

  it("excludes the current raid itself", () => {
    expect(getSameOccurrenceRaids([current], current)).toHaveLength(0);
  });

  it("sorts newest first", () => {
    const all = [
      current,
      makeRaid({ uid: "old", startAt: "2024-01-01T00:00:00.000Z" as UtcIsoString }),
      makeRaid({ uid: "mid", startAt: "2024-08-01T00:00:00.000Z" as UtcIsoString }),
      makeRaid({ uid: "new", startAt: "2025-03-01T00:00:00.000Z" as UtcIsoString }),
    ];
    expect(getSameOccurrenceRaids(all, current).map((raid) => raid.uid)).toEqual(["new", "mid", "old"]);
  });
});
