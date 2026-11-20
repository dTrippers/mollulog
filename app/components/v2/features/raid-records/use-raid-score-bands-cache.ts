import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RaidRecordDefenseType, RaidRecordRaidType } from "~/domain/raid-record";
import { fetchRaidScoreBands } from "~/lib/ranks/raid-score-bands";
import type { RaidScoreBandsState } from "./use-raid-score-bands";

export type RaidScoreBandsKey = {
  raidType: RaidRecordRaidType;
  rankSeasonIndex: number | null;
  defenseType: RaidRecordDefenseType;
};

function cacheKey({ raidType, rankSeasonIndex, defenseType }: RaidScoreBandsKey) {
  return `${raidType}:${rankSeasonIndex ?? "none"}:${defenseType}`;
}

// The difficulty bands of the seasons a screen asks for, fetched once each and only when asked. The table asks only for
// the rows the Sensei changed, so a screen of a hundred seasons does not request a hundred distributions.
export function useRaidScoreBandsCache() {
  const [states, setStates] = useState<Record<string, RaidScoreBandsState>>({});
  const requested = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const request = useCallback((key: RaidScoreBandsKey) => {
    const id = cacheKey(key);
    if (requested.current.has(id)) return;
    requested.current.add(id);
    setStates((current) => ({ ...current, [id]: { status: "loading" } }));
    fetchRaidScoreBands(key.raidType, key.rankSeasonIndex, key.defenseType).then(
      (bands) => {
        if (mounted.current) setStates((current) => ({ ...current, [id]: { status: "ready", bands } }));
      },
      () => {
        if (mounted.current) setStates((current) => ({ ...current, [id]: { status: "failed" } }));
      },
    );
  }, []);

  const get = useCallback((key: RaidScoreBandsKey): RaidScoreBandsState | undefined => states[cacheKey(key)], [states]);

  return useMemo(() => ({ request, get }), [request, get]);
}
