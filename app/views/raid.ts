import { getActiveSensei } from "~/auth/authenticator.server";
import { raidTypeFromParam } from "~/domain/raid";
import { getAllRaidSchedules, getRaidScheduleByTypeAndSeason } from "~/models/raid";

function raidKey(raid: { raidType: string; seasonIndex: number }) {
  return `${raid.raidType}:${raid.seasonIndex}`;
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
