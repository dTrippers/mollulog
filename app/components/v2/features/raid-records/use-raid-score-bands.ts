import { useEffect, useState } from "react";
import type { RaidRecordDefenseType, RaidRecordRaidType, RaidScoreBands } from "~/domain/raid-record";
import { fetchRaidScoreBands } from "~/lib/ranks/raid-score-bands";

export type RaidScoreBandsState =
  | { status: "loading" }
  // Null bands: the rank data has none for the season yet, so scores save without a difficulty.
  | { status: "ready"; bands: RaidScoreBands | null }
  | { status: "failed" };

// The difficulty bands of each defense type of the chosen season, for the score preview under each field.
export function useRaidScoreBands(
  season: { raidType: RaidRecordRaidType; rankSeasonIndex: number | null } | null,
  defenseTypes: readonly RaidRecordDefenseType[],
): Partial<Record<RaidRecordDefenseType, RaidScoreBandsState>> {
  const [states, setStates] = useState<Partial<Record<RaidRecordDefenseType, RaidScoreBandsState>>>({});
  const raidType = season?.raidType ?? null;
  const rankSeasonIndex = season?.rankSeasonIndex ?? null;
  const key = defenseTypes.join(",");
  useEffect(() => {
    if (raidType === null) {
      setStates({});
      return;
    }
    let cancelled = false;
    const list = key ? (key.split(",") as RaidRecordDefenseType[]) : [];
    setStates(Object.fromEntries(list.map((defenseType) => [defenseType, { status: "loading" }])));
    for (const defenseType of list) {
      fetchRaidScoreBands(raidType, rankSeasonIndex, defenseType).then(
        (bands) => {
          if (!cancelled) setStates((current) => ({ ...current, [defenseType]: { status: "ready", bands } }));
        },
        () => {
          if (!cancelled) setStates((current) => ({ ...current, [defenseType]: { status: "failed" } }));
        },
      );
    }
    return () => {
      cancelled = true;
    };
  }, [raidType, rankSeasonIndex, key]);
  return states;
}
