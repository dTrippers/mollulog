import { getActiveSensei } from "~/auth/authenticator.server";
import { getRaidOccurrenceKey } from "~/domain/raid-group";
import type { Defense } from "~/graphql/graphql";
import { raidTypeFromParam } from "~/domain/raid";
import { compareInstantAsc, compareInstantDesc, isInstantAfter, isInstantBefore, nowUtcIso } from "~/lib/date-time";
import type { Terrain } from "~/models/content.d";
import { getAllRaidSchedules, getRaidScheduleByTypeAndSeason, type RaidScheduleListItem } from "~/models/raid";

function raidKey(raid: { raidType: string; seasonIndex: number }) {
  return `${raid.raidType}:${raid.seasonIndex}`;
}

function isRaidPortalTarget(raid: { raidType: string }) {
  return raid.raidType === "total_assault" || raid.raidType === "elimination";
}

function isOngoingRaid(raid: { startAt: string | null; endAt: string | null }, now: string) {
  return raid.startAt && raid.endAt && !isInstantAfter(raid.startAt, now) && !isInstantBefore(raid.endAt, now);
}

function sortByStartAtAsc<T extends { startAt: string | null }>(raids: T[], fallback: string) {
  return [...raids].sort((a, b) => compareInstantAsc(a.startAt ?? fallback, b.startAt ?? fallback));
}

function sortByStartAtDesc<T extends { startAt: string | null }>(raids: T[], fallback: string) {
  return [...raids].sort((a, b) => {
    if (!a.startAt && !b.startAt) return 0;
    if (!a.startAt) return 1;
    if (!b.startAt) return -1;
    return compareInstantDesc(a.startAt ?? fallback, b.startAt ?? fallback);
  });
}

function uniqueRaids<T extends { raidType: string; seasonIndex: number }>(raids: T[]) {
  const seen = new Set<string>();
  return raids.filter((raid) => {
    const key = raidKey(raid);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getPrimaryDefenseTypes(raid: RaidScheduleListItem) {
  return raid.defenseTypeSets.map((defenseTypeSet) => defenseTypeSet.primaryDefenseType);
}

export type RaidPortalSchedule = RaidScheduleListItem;

export type RaidPortalBossGroup = {
  bossUid: string;
  bossName: string;
  terrain: Terrain;
  count: number;
  defenseTypes: Defense[];
  latest: {
    raidType: string;
    seasonIndex: number;
    startAt: string | null;
  };
};

export async function loadRaidPortal(env: Env) {
  const now = nowUtcIso();
  const raids = (await getAllRaidSchedules(env)).filter(isRaidPortalTarget);

  const ongoing = sortByStartAtAsc(
    raids.filter((raid) => isOngoingRaid(raid, now)),
    now,
  );
  const upcoming = sortByStartAtAsc(
    raids.filter((raid) => raid.startAt && isInstantAfter(raid.startAt, now)),
    now,
  ).slice(0, 2);
  const groups = new Map<
    string,
    {
      bossUid: string;
      bossName: string;
      terrain: Terrain;
      raids: RaidScheduleListItem[];
      defenseTypes: Set<Defense>;
    }
  >();

  for (const raid of raids) {
    const key = getRaidOccurrenceKey(raid);
    const group = groups.get(key) ?? {
      bossUid: raid.raidBoss.uid,
      bossName: raid.raidBoss.name,
      terrain: raid.terrain,
      raids: [],
      defenseTypes: new Set<Defense>(),
    };
    group.raids.push(raid);
    for (const defenseType of getPrimaryDefenseTypes(raid)) {
      group.defenseTypes.add(defenseType);
    }
    groups.set(key, group);
  }

  const bossGroups = Array.from(groups.values())
    .flatMap((group): RaidPortalBossGroup[] => {
      const latest = sortByStartAtDesc(group.raids, now)[0];
      if (!latest) {
        return [];
      }
      return [
        {
          bossUid: group.bossUid,
          bossName: group.bossName,
          terrain: group.terrain,
          count: group.raids.length,
          defenseTypes: Array.from(group.defenseTypes),
          latest: {
            raidType: latest.raidType,
            seasonIndex: latest.seasonIndex,
            startAt: latest.startAt,
          },
        },
      ];
    })
    .sort((a, b) => {
      if (!a.latest.startAt && !b.latest.startAt) return 0;
      if (!a.latest.startAt) return 1;
      if (!b.latest.startAt) return -1;
      return compareInstantDesc(a.latest.startAt, b.latest.startAt);
    });

  return {
    ongoing,
    upcoming,
    bossGroups,
  };
}

export async function loadRaidSeasonPage(env: Env, request: Request, raidTypeParam: string, seasonIndex: number) {
  const raidType = raidTypeFromParam(raidTypeParam);
  const [currentRaid, allRaidSchedules, sensei] = await Promise.all([
    getRaidScheduleByTypeAndSeason(env, raidType, seasonIndex),
    getAllRaidSchedules(env),
    getActiveSensei(env, request),
  ]);

  const mergedRaids = new Map(allRaidSchedules.map((raid) => [raidKey(raid), raid]));

  return {
    currentRaid,
    allRaids: Array.from(mergedRaids.values()),
    signedIn: sensei !== null,
  };
}
