import { type UtcIsoString, compareInstantDesc, nowUtcIso } from "~/lib/date-time";
import type { Terrain } from "~/models/content.d";

// ============================================================
// Raid grouping (boss + terrain [+ defenseType])
//
// Pure logic only — keep BAQL read/orchestration in repositories.
// ============================================================

type RaidGroupInput = {
  raidBoss: { uid: string };
  terrain: Terrain;
};

/** Recurrence unit shared by every hosting of the same fight: boss + terrain. */
export function getRaidOccurrenceKey(raid: RaidGroupInput): string {
  return `${raid.raidBoss.uid}:${raid.terrain}`;
}

type OccurrenceRaid = RaidGroupInput & {
  uid: string;
  startAt: UtcIsoString | null;
  jpSchedule: { seasonIndex: number } | null;
};

/**
 * Past hostings in the same occurrence group (same boss + terrain) as the current raid,
 * excluding the current raid and any without JP-server statistics, newest first.
 */
export function getSameOccurrenceRaids<T extends OccurrenceRaid>(allRaids: T[], currentRaid: OccurrenceRaid): T[] {
  const occurrenceKey = getRaidOccurrenceKey(currentRaid);
  const fallbackNow = currentRaid.startAt ?? nowUtcIso();
  return allRaids
    .filter(
      (raid) =>
        getRaidOccurrenceKey(raid) === occurrenceKey && raid.jpSchedule !== null && raid.uid !== currentRaid.uid,
    )
    .sort((a, b) => compareInstantDesc(a.startAt ?? fallbackNow, b.startAt ?? fallbackNow));
}
