import { FunnelIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getMaxLevelAt, RaidVideosScreen } from "~/components/features/raids";
import { raidTypeFromParam, raidTypeToParam } from "~/domain/raid";
import { getFilterableRaidDifficulties, getRaidDifficultyScoreRange, parseDifficulty } from "~/domain/raid-score";
import { fetchRaidVideos } from "~/lib/ranks";
import { getRaidDefenseTypeSetByQuery, getRaidDefenseTypeSetKey, getRaidScheduleByTypeAndSeason } from "~/models/raid";
import { getRaidVideoParties, parseVideoSort, RAID_VIDEOS_PAGE_SIZE } from "~/models/raid-videos";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { getAllStudentsMap } from "~/models/student";
import type { RaidPageContext } from "./raids.$raidType.$seasonIndex";
import RaidVideosPanel from "./raids.$raidType.$seasonIndex._components/RaidVideosPanel";
import { useRaidVideosFeed } from "./raids.$raidType.$seasonIndex._components/useRaidVideosFeed";

function createErrorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const loader = async ({ params, request, context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const { raidType, seasonIndex } = params;
  if (!raidType || !seasonIndex) {
    throw createErrorResponse("총력전/대결전 정보를 찾을 수 없어요", 404);
  }

  const parsedSeasonIndex = Number.parseInt(seasonIndex, 10);
  if (Number.isNaN(parsedSeasonIndex)) {
    throw createErrorResponse("총력전/대결전 정보를 찾을 수 없어요", 404);
  }

  const currentRaid = await getRaidScheduleByTypeAndSeason(env, raidTypeFromParam(raidType), parsedSeasonIndex);
  if (!currentRaid) {
    throw createErrorResponse("총력전/대결전 정보를 찾을 수 없어요", 404);
  }

  const url = new URL(request.url);
  const sort = parseVideoSort(url.searchParams.get("sort"));
  const defenseTypeSet = getRaidDefenseTypeSetByQuery(
    currentRaid.defenseTypeSets,
    url.searchParams.get("defenseTypeSet"),
    url.searchParams.get("defenseType"),
  );
  const requestedDifficulty = parseDifficulty(url.searchParams.get("difficulty"));
  const filterableDifficulties = getFilterableRaidDifficulties(defenseTypeSet?.difficulty);
  const difficulty =
    requestedDifficulty && filterableDifficulties.includes(requestedDifficulty) ? requestedDifficulty : null;
  const scoreRange = getRaidDifficultyScoreRange(difficulty);
  const [rawAllStudents, sensei] = await Promise.all([getAllStudentsMap(env, true), getActiveSensei(env, request)]);
  const recruitedStudentTiers = sensei ? await getRecruitedStudentTiers(env, sensei.id) : {};
  const allStudents = Object.fromEntries(
    Object.entries(rawAllStudents).map(([uid, student]) => [
      uid,
      {
        name: student.name,
        attackType: student.attackType,
        defenseType: student.defenseType,
        role: student.role,
      },
    ]),
  );

  try {
    const initialData = await fetchRaidVideos({
      raidType: currentRaid.raidType,
      boss: currentRaid.raidBoss.uid,
      defenseType: defenseTypeSet?.primaryDefenseType,
      scoreGte: scoreRange?.gte,
      scoreLt: scoreRange?.lt,
      limit: RAID_VIDEOS_PAGE_SIZE,
      offset: 0,
      sort,
    });
    return {
      initialData,
      allStudents,
      recruitedStudentTiers,
      hasRecruitedStudentData: sensei !== null,
    };
  } catch {
    throw createErrorResponse("공략 영상을 불러오는 중 오류가 발생했어요", 500);
  }
};

export default function RaidVideos() {
  const { currentRaid, defenseType, defenseTypeSet, setPanel } = useOutletContext<RaidPageContext>();
  const { initialData, allStudents, recruitedStudentTiers, hasRecruitedStudentData } = useLoaderData<typeof loader>();
  const { allVideos, hasMore, isLoading, loadingRef, difficulty, setDifficulty, sort, setSort } = useRaidVideosFeed({
    initialData,
    raidType: raidTypeToParam(currentRaid.raidType),
    seasonIndex: currentRaid.seasonIndex,
    defenseType,
  });
  const [onlyWithParty, setOnlyWithParty] = useState(true);
  const [showUnrecruitedStudents, setShowUnrecruitedStudents] = useState(true);
  const filterableDifficulties = useMemo(
    () => getFilterableRaidDifficulties(defenseTypeSet.difficulty),
    [defenseTypeSet.difficulty],
  );
  const ranksSearchParams = new URLSearchParams({
    defenseTypeSet: getRaidDefenseTypeSetKey(defenseTypeSet),
    defenseType,
  });
  const ranksPath = `/raids/${raidTypeToParam(currentRaid.raidType)}/${currentRaid.seasonIndex}/ranks?${ranksSearchParams.toString()}`;

  useEffect(() => {
    if (difficulty && !filterableDifficulties.includes(difficulty)) {
      setDifficulty(null);
    }
  }, [difficulty, filterableDifficulties, setDifficulty]);
  const visibleVideos = useMemo(
    () => (onlyWithParty ? allVideos.filter((video) => getRaidVideoParties(video).length > 0) : allVideos),
    [allVideos, onlyWithParty],
  );

  useEffect(() => {
    setPanel({
      title: "필터 및 정렬",
      Icon: FunnelIcon,
      children: (
        <RaidVideosPanel
          difficulty={difficulty}
          filterableDifficulties={filterableDifficulties}
          onDifficultyChange={setDifficulty}
          sort={sort}
          onSortChange={setSort}
          onlyWithParty={onlyWithParty}
          onOnlyWithPartyChange={setOnlyWithParty}
          showUnrecruitedStudents={showUnrecruitedStudents}
          onShowUnrecruitedStudentsChange={setShowUnrecruitedStudents}
          canShowUnrecruitedStudents={hasRecruitedStudentData}
        />
      ),
    });
  }, [
    difficulty,
    filterableDifficulties,
    hasRecruitedStudentData,
    onlyWithParty,
    setDifficulty,
    setPanel,
    setSort,
    showUnrecruitedStudents,
    sort,
  ]);

  return (
    <RaidVideosScreen
      videos={visibleVideos}
      hasMore={hasMore}
      isLoading={isLoading}
      loadingRef={loadingRef}
      allStudents={allStudents}
      maxLevel={getMaxLevelAt(currentRaid.startAt ?? new Date())}
      recruitedStudentTiers={recruitedStudentTiers}
      showUnrecruitedStudents={hasRecruitedStudentData && showUnrecruitedStudents}
      ranksPath={ranksPath}
      emptyText={onlyWithParty ? "편성 정보가 있는 공략 영상이 없어요" : undefined}
    />
  );
}
