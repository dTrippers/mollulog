import type { RaidRowSeason } from "~/domain/raid-season-resolution";
import type { Attack, Defense, Difficulty, Terrain } from "~/graphql/graphql";
import { toUtcIso, type UtcIsoString } from "~/lib/date-time";
import type { RaidSchedule, RaidScheduleListItem } from "~/models/raid";
import type { TimelineRaidRow } from "~/models/timeline-content.server";

// BAQL raid schedules as the public API returned them on 2026-11-28. Each `gl` forecast is shown next to its JP season.

type RawRaidSchedule = {
  uid: string;
  raidType: string;
  seasonIndex: number;
  region: string;
  terrain: string;
  startAt: string;
  endAt: string;
  attackType: string | null;
  raidBoss: { uid: string; name: string };
  defenseTypeSets: { difficulty: string | null; defenseTypes: string[] }[];
  jpSchedule: { uid: string; seasonIndex: number; startAt: string } | null;
};

export const GL_TOTAL_ASSAULT_89: RawRaidSchedule = {
  uid: "gl_total_assault_89",
  raidType: "total_assault",
  seasonIndex: 89,
  region: "gl",
  terrain: "indoor",
  startAt: "2026-12-15T02:00:00Z",
  endAt: "2026-12-21T19:00:00Z",
  attackType: "mystic",
  raidBoss: { uid: "perorodzilla", name: "페로로지라" },
  defenseTypeSets: [{ difficulty: "lunatic", defenseTypes: ["special"] }],
  jpSchedule: { uid: "jp_total_assault_92", seasonIndex: 92, startAt: "2026-09-02T02:00:00Z" },
};

export const JP_TOTAL_ASSAULT_92: RawRaidSchedule = {
  uid: "jp_total_assault_92",
  raidType: "total_assault",
  seasonIndex: 92,
  region: "jp",
  terrain: "indoor",
  startAt: "2026-09-02T02:00:00Z",
  endAt: "2026-09-08T19:00:00Z",
  attackType: "mystic",
  raidBoss: { uid: "perorodzilla", name: "페로로지라" },
  defenseTypeSets: [{ difficulty: "lunatic", defenseTypes: ["special"] }],
  jpSchedule: null,
};

/** A forecast whose `gl` schedule lists less than its JP season: no attack type, no defense types. */
export const GL_UNLIMIT_31: RawRaidSchedule = {
  uid: "gl_unlimit_31",
  raidType: "unlimit",
  seasonIndex: 31,
  region: "gl",
  terrain: "indoor",
  startAt: "2027-01-06T02:00:00Z",
  endAt: "2027-02-08T19:00:00Z",
  attackType: null,
  raidBoss: { uid: "tiphareth", name: "티페레트" },
  defenseTypeSets: [],
  jpSchedule: { uid: "jp_unlimit_31", seasonIndex: 31, startAt: "2026-09-24T02:00:00Z" },
};

export const JP_UNLIMIT_31: RawRaidSchedule = {
  uid: "jp_unlimit_31",
  raidType: "unlimit",
  seasonIndex: 31,
  region: "jp",
  terrain: "indoor",
  startAt: "2026-09-24T02:00:00Z",
  endAt: "2026-10-27T19:00:00Z",
  attackType: "piercing",
  raidBoss: { uid: "tiphareth", name: "티페레트" },
  defenseTypeSets: [{ difficulty: null, defenseTypes: ["heavy"] }],
  jpSchedule: null,
};

/** The boss BAQL spells `nightmare` in `gl` schedules and `nightmare_train` in JP ones. */
export const GL_TOTAL_ASSAULT_91: RawRaidSchedule = {
  uid: "gl_total_assault_91",
  raidType: "total_assault",
  seasonIndex: 91,
  region: "gl",
  terrain: "indoor",
  startAt: "2027-02-16T02:00:00Z",
  endAt: "2027-02-22T19:00:00Z",
  attackType: "explosive",
  raidBoss: { uid: "nightmare", name: "악몽 열차" },
  defenseTypeSets: [{ difficulty: "lunatic", defenseTypes: ["light"] }],
  jpSchedule: { uid: "jp_total_assault_94", seasonIndex: 94, startAt: "2026-11-04T02:00:00Z" },
};

export const JP_TOTAL_ASSAULT_94: RawRaidSchedule = {
  uid: "jp_total_assault_94",
  raidType: "total_assault",
  seasonIndex: 94,
  region: "jp",
  terrain: "indoor",
  startAt: "2026-11-04T02:00:00Z",
  endAt: "2026-11-10T19:00:00Z",
  attackType: "explosive",
  raidBoss: { uid: "nightmare_train", name: "악몽 열차" },
  defenseTypeSets: [{ difficulty: "lunatic", defenseTypes: ["light"] }],
  jpSchedule: null,
};

/**
 * Not BAQL data: a hypothetical official `gl` #89 of another JP season (95) than the one a forecast row predicted for
 * #89 (JP 92), for the case where BAQL's numbering differs from MolluLog's forecast.
 */
export const OFFICIAL_GL_TOTAL_ASSAULT_89_OF_JP_95: RawRaidSchedule = {
  uid: "gl_total_assault_89",
  raidType: "total_assault",
  seasonIndex: 89,
  region: "gl",
  terrain: "outdoor",
  startAt: "2026-12-15T02:00:00Z",
  endAt: "2026-12-21T19:00:00Z",
  attackType: "piercing",
  raidBoss: { uid: "hod", name: "호드" },
  defenseTypeSets: [{ difficulty: "lunatic", defenseTypes: ["heavy"] }],
  jpSchedule: { uid: "jp_total_assault_95", seasonIndex: 95, startAt: "2026-11-18T02:00:00Z" },
};

/** A list item the way `getAllRaidSchedules` normalizes it. */
export function raidListItem(raw: RawRaidSchedule): RaidScheduleListItem {
  const defenseTypeSets = raw.defenseTypeSets.flatMap(({ difficulty, defenseTypes }) => {
    const [primaryDefenseType, ...secondaryDefenseTypes] = defenseTypes as Defense[];
    return primaryDefenseType
      ? [
          {
            difficulty: difficulty as Difficulty | null,
            defenseTypes: [...(defenseTypes as Defense[])],
            primaryDefenseType,
            secondaryDefenseTypes,
          },
        ]
      : [];
  });
  return {
    uid: raw.uid,
    raidType: raw.raidType,
    seasonIndex: raw.seasonIndex,
    region: raw.region,
    terrain: raw.terrain as Terrain,
    startAt: toUtcIso(raw.startAt),
    endAt: toUtcIso(raw.endAt),
    attackType: raw.attackType as Attack | null,
    raidBoss: { ...raw.raidBoss },
    defenseTypeSets,
    defenseTypes: defenseTypeSets.flatMap(({ difficulty, defenseTypes }, setIndex) =>
      defenseTypes.map((defenseType, index) => ({ defenseType, difficulty, primary: index === 0, setIndex })),
    ),
    jpSchedule: raw.jpSchedule ? { ...raw.jpSchedule, startAt: toUtcIso(raw.jpSchedule.startAt) } : null,
  };
}

/** A detail the way `getRaidSchedule` normalizes it. */
export function raidDetail(raw: RawRaidSchedule): RaidSchedule {
  const item = raidListItem(raw);
  return { ...item, raidBoss: { ...item.raidBoss, nameJa: `${raw.raidBoss.name} (ja)` } };
}

export function raidRow({
  uid,
  contentUid = null,
  startAt,
  endAt,
  raidSeason = { raidType: null, jpRaidSeasonIndex: null, glRaidSeasonIndex: null },
}: {
  uid: string;
  contentUid?: string | null;
  startAt: string;
  endAt: string | null;
  raidSeason?: RaidRowSeason;
}): TimelineRaidRow {
  return {
    uid,
    name: uid,
    nameI18n: { ko: uid },
    contentType: "raid",
    contentUid,
    startAt: toUtcIso(startAt) as UtcIsoString,
    endAt: endAt ? toUtcIso(endAt) : null,
    endless: endAt === null,
    imageUrl: null,
    imageBlurhash: null,
    videos: [],
    runType: "first",
    occurrence: null,
    shopContentUid: null,
    recruitmentGroupUid: null,
    recruitmentStudentUids: null,
    confirmed: false,
    isSpoiler: false,
    tags: [],
    earnablePyroxene: null,
    featuredUntil: null,
    syncedAt: null,
    raidSeason,
  };
}
