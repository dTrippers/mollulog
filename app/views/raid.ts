import { getActiveSensei } from "~/auth/authenticator.server";
import { raidTypeFromParam } from "~/domain/raid";
import {
  getKoreanRaidScheduleByTypeAndSeason,
  getNumberedKoreanRaidSchedules,
  loadKoreanRaidSeasons,
} from "~/models/raid-season.server";

function raidKey(raid: { raidType: string; seasonIndex: number }) {
  return `${raid.raidType}:${raid.seasonIndex}`;
}

export async function loadRaidSeasonPage(env: Env, request: Request, raidTypeParam: string, seasonIndex: number) {
  const raidType = raidTypeFromParam(raidTypeParam);
  const [seasons, sensei] = await Promise.all([loadKoreanRaidSeasons(env), getActiveSensei(env, request)]);
  const [currentRaid, allRaidSchedules] = await Promise.all([
    getKoreanRaidScheduleByTypeAndSeason(env, raidType, seasonIndex, { seasons }),
    // A forecast season without a Korean-server season number has no season page, so the selectors leave it out.
    getNumberedKoreanRaidSchedules(env, { seasons }),
  ]);

  const mergedRaids = new Map(allRaidSchedules.map((raid) => [raidKey(raid), raid]));

  return {
    currentRaid,
    allRaids: Array.from(mergedRaids.values()),
    signedIn: sensei !== null,
  };
}
