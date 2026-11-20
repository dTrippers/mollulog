import type { RaidRecordDefenseType, RaidRecordRaidType, RaidScoreBands } from "~/domain/raid-record";
import type { Defense } from "~/graphql/graphql";
import { fetchClearTimeDistribution } from "./clear-time-distribution";

// The difficulty bands of one season and defense type, or null when the rank data has none. A failed request throws,
// so a caller never reads "no data" for a season that has data. The form preview uses it in the browser; the server
// save reads the same response with fetchRaidScoreBandsOnServer.
export async function fetchRaidScoreBands(
  raidType: RaidRecordRaidType,
  rankSeasonIndex: number | null,
  defenseType: RaidRecordDefenseType,
): Promise<RaidScoreBands | null> {
  if (rankSeasonIndex === null) return null;
  const distribution = await fetchClearTimeDistribution({
    raidType,
    season: rankSeasonIndex,
    // RaidRecordDefenseType lists the same values as the generated Defense enum.
    defenseType: defenseType as Defense,
  });
  if (distribution.bands.length === 0 || distribution.timeBudgetSec <= 0) return null;
  return {
    bands: distribution.bands.map(({ difficulty, scorePerSecond, floorScore }) => ({
      difficulty,
      scorePerSecond,
      floorScore,
    })),
    timeBudgetSec: distribution.timeBudgetSec,
  };
}
