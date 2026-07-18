import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { raidTypeFromParam } from "~/domain/raid";
import { routeError } from "~/lib/http-errors";
import { getRaidDefenseTypeSetByQuery, getRaidScheduleByTypeAndSeason } from "~/models/raid";

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  const raidType = params.raidType ? raidTypeFromParam(params.raidType) : null;
  const seasonIndex = Number.parseInt(params.seasonIndex ?? "", 10);
  if (!raidType || Number.isNaN(seasonIndex)) {
    throw routeError(404, "raid.not_found", "레이드 정보를 찾을 수 없어요.");
  }
  const raid = await getRaidScheduleByTypeAndSeason(context.cloudflare.env, raidType, seasonIndex);
  if (!raid) throw routeError(404, "raid.not_found", "레이드 정보를 찾을 수 없어요.");

  const currentSearchParams = new URL(request.url).searchParams;
  const defenseTypeSet = getRaidDefenseTypeSetByQuery(
    raid.defenseTypeSets,
    currentSearchParams.get("defenseTypeSet"),
    currentSearchParams.get("defenseType"),
  );
  const timelineSearchParams = new URLSearchParams({
    bossUid: raid.raidBoss.uid,
    terrain: raid.terrain,
  });
  if (defenseTypeSet?.primaryDefenseType) {
    timelineSearchParams.set("defenseType", defenseTypeSet.primaryDefenseType);
  }
  const difficulty = currentSearchParams.get("difficulty");
  if (difficulty) timelineSearchParams.set("difficulty", difficulty);

  return redirect(`/timelines?${timelineSearchParams.toString()}`);
};

export default function LegacyRaidWalkthroughTimelineRedirect() {
  return null;
}
