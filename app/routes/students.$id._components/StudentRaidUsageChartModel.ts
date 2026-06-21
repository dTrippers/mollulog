import { Attack, Defense } from "~/graphql/graphql";
import { type UtcIsoString, compareInstantAsc, getInstantTime, isInstantAfter } from "~/lib/date-time";
import type { RaidType } from "~/models/content.d";

export type StudentRaidUsageDefenseFilter = Defense | "all";

export type StudentRaidUsageStat = {
  raid: { raidType: RaidType; season: number; defenseType: Defense };
  studentUid: string;
  slotsCount: number;
  slotsByTier: { tier: number; count: number }[];
  assistsCount: number;
  assistsByTier: { tier: number; count: number }[];
};

export type StudentRaidUsageRaid = {
  raidType: string;
  seasonIndex: number;
  raidBoss: { uid?: string; name: string };
  startAt: UtcIsoString | null;
  jpSchedule: { seasonIndex: number; startAt: UtcIsoString | null } | null;
  defenseTypeSets?: { primaryDefenseType: Defense; difficulty?: string | null }[];
  defenseTypes: { defenseType: Defense; difficulty?: string | null }[];
};

export type StudentRaidUsageChartRow = {
  id: string;
  raidType: RaidType;
  seasonIndex: number;
  jpSeasonIndex: number;
  defenseType: Defense;
  startAt: UtcIsoString;
  bossName: string;
  totalCount: number;
  slotCount: number;
  assistCount: number;
  label: string;
  xAxisLabel: string;
} & Record<`tier${number}`, number>;

export type StudentRaidUsageChartData = {
  rows: StudentRaidUsageChartRow[];
  tierKeys: string[];
  yAxisMax: number;
};

const RAID_TYPES = new Set(["total_assault", "elimination"]);
const DEFAULT_TIER_KEYS = [9, 8, 7, 6, 5, 4, 3].map((tier) => `tier${tier}`);
const MAX_RAID_USAGE_COUNT = 20000;
const RANKS_STATISTICS_AVAILABLE_FROM = "2024-03-01T00:00:00.000Z" as UtcIsoString;

export function getDefaultRaidUsageDefenseFilter(attackType: Attack): StudentRaidUsageDefenseFilter {
  const filterByAttackType: Partial<Record<Attack, StudentRaidUsageDefenseFilter>> = {
    [Attack.Explosive]: Defense.Light,
    [Attack.Piercing]: Defense.Heavy,
    [Attack.Mystic]: Defense.Special,
    [Attack.Sonic]: Defense.Elastic,
  };

  return filterByAttackType[attackType] ?? "all";
}

function statKey(params: { raidType: string; season: number; defenseType: string }) {
  return `${params.raidType}:${params.season}:${params.defenseType}`;
}

function addTierCount(row: StudentRaidUsageChartRow, tier: number, count: number) {
  const key = `tier${tier}` as const;
  row[key] = (row[key] ?? 0) + count;
}

function createEmptyRow(params: {
  raidType: RaidType;
  seasonIndex: number;
  jpSeasonIndex: number;
  defenseType: Defense;
  startAt: UtcIsoString;
  bossName: string;
  xAxisLabel: string;
}) {
  const row: StudentRaidUsageChartRow = {
    id: `${params.raidType}:${params.seasonIndex}:${params.defenseType}`,
    raidType: params.raidType,
    seasonIndex: params.seasonIndex,
    jpSeasonIndex: params.jpSeasonIndex,
    defenseType: params.defenseType,
    startAt: params.startAt,
    bossName: params.bossName,
    totalCount: 0,
    slotCount: 0,
    assistCount: 0,
    label: `#${params.seasonIndex}`,
    xAxisLabel: params.xAxisLabel,
  };

  for (const tierKey of DEFAULT_TIER_KEYS) {
    row[tierKey as `tier${number}`] = 0;
  }

  return row;
}

function applyStatistics(row: StudentRaidUsageChartRow, stat: StudentRaidUsageStat | undefined) {
  if (!stat) {
    return;
  }

  row.slotCount = stat.slotsCount;
  row.assistCount = stat.assistsCount;
  row.totalCount = stat.slotsCount + stat.assistsCount;

  for (const { tier, count } of stat.slotsByTier) {
    addTierCount(row, tier, count);
  }
  for (const { tier, count } of stat.assistsByTier) {
    addTierCount(row, tier, count);
  }
}

export function buildStudentRaidUsageChartData({
  releaseAt,
  raids,
  statistics,
  selectedDefenseType,
}: {
  releaseAt: UtcIsoString | null;
  raids: StudentRaidUsageRaid[];
  statistics: StudentRaidUsageStat[];
  selectedDefenseType: StudentRaidUsageDefenseFilter;
}): StudentRaidUsageChartData {
  if (!releaseAt || Number.isNaN(getInstantTime(releaseAt))) {
    return { rows: [], tierKeys: DEFAULT_TIER_KEYS, yAxisMax: 0 };
  }

  const statsByKey = new Map(
    statistics.map((stat) => [
      statKey({
        raidType: stat.raid.raidType,
        season: stat.raid.season,
        defenseType: stat.raid.defenseType,
      }),
      stat,
    ]),
  );

  const rows = raids
    .filter((raid) => RAID_TYPES.has(raid.raidType))
    .filter((raid) => raid.startAt && raid.jpSchedule?.startAt)
    .filter(
      (
        raid,
      ): raid is StudentRaidUsageRaid & {
        startAt: UtcIsoString;
        jpSchedule: { seasonIndex: number; startAt: UtcIsoString };
      } => Boolean(raid.startAt && raid.jpSchedule?.startAt),
    )
    .filter((raid) => !isInstantAfter(releaseAt, raid.startAt))
    .filter((raid) => !isInstantAfter(RANKS_STATISTICS_AVAILABLE_FROM, raid.jpSchedule.startAt))
    .sort((a, b) => compareInstantAsc(a.startAt, b.startAt))
    .flatMap((raid, index, sortedRaids) => {
      const year = new Date(raid.startAt).getUTCFullYear().toString();
      const previousRaid = sortedRaids[index - 1];
      const previousYear = previousRaid ? new Date(previousRaid.startAt).getUTCFullYear().toString() : null;
      const primaryDefenseTypes =
        raid.defenseTypeSets?.map(({ primaryDefenseType }) => ({
          defenseType: primaryDefenseType,
        })) ?? raid.defenseTypes;
      const defenseTypes = primaryDefenseTypes.filter(
        ({ defenseType }) => selectedDefenseType === "all" || defenseType === selectedDefenseType,
      );

      return defenseTypes.map(({ defenseType }, defenseIndex) => {
        const row = createEmptyRow({
          raidType: raid.raidType as RaidType,
          seasonIndex: raid.seasonIndex,
          jpSeasonIndex: raid.jpSchedule.seasonIndex,
          defenseType,
          startAt: raid.startAt,
          bossName: raid.raidBoss.name,
          xAxisLabel: year !== previousYear && defenseIndex === 0 ? year : "",
        });
        applyStatistics(
          row,
          statsByKey.get(
            statKey({
              raidType: raid.raidType,
              season: raid.jpSchedule.seasonIndex,
              defenseType,
            }),
          ),
        );
        return row;
      });
    });

  const tierKeys = Array.from(
    new Set([
      ...DEFAULT_TIER_KEYS,
      ...rows.flatMap((row) =>
        Object.keys(row).filter((key) => key.startsWith("tier") && Number(row[key as `tier${number}`]) > 0),
      ),
    ]),
  ).sort((a, b) => Number(b.replace("tier", "")) - Number(a.replace("tier", "")));
  const maxCount = rows.length > 0 ? Math.max(...rows.map((row) => row.totalCount)) : 0;

  return {
    rows,
    tierKeys,
    yAxisMax: Math.max(MAX_RAID_USAGE_COUNT, maxCount),
  };
}
