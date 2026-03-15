import { useEffect, useMemo, useState } from "react";
import { type LoaderFunctionArgs, useLoaderData, useOutletContext } from "react-router";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import RaidRankFilter, { mergeFilteredStudents, type RaidRankFilterState } from "~/components/features/raids/RaidRankFilter";
import { RaidRankScreen } from "~/components/features/raids";
import type { RaidPageContext } from "./raids.$id";
import { getAllStudentsMap } from "~/models/student";
import { getAuthenticator } from "~/auth/authenticator.server";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { Difficulty } from "~/graphql/graphql";
import type { Difficulty as DifficultyType } from "~/models/raid";
import { fetchRaidStatisticsByRaid } from "~/models/raid-statistics.client";
import RaidUnavailableState from "./raids.$id._components/RaidUnavailableState";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const rawAllStudents = await getAllStudentsMap(env, true);
  const allStudents = Object.fromEntries(Object.entries(rawAllStudents).map(([uid, student]) => [uid, {
    name: student.name,
    attackType: student.attackType,
    defenseType: student.defenseType,
    role: student.role,
  }]));

  const sensei = await getAuthenticator(env).isAuthenticated(request);
  const recruitedStudentTiers = sensei ? await getRecruitedStudentTiers(env, sensei.id) : {};

  return {
    allStudents,
    recruitedStudentTiers,
  };
};

export default function RaidRanks() {
  const { currentRaid, defenseType, setPanel, signedIn } = useOutletContext<RaidPageContext>();
  const { allStudents, recruitedStudentTiers } = useLoaderData<typeof loader>();

  if (!currentRaid.rankVisible || currentRaid.raidIndexJp === null) {
    return <RaidUnavailableState raidType={currentRaid.type} />;
  }

  // Get all students for current raid
  const [filterableStudents, setFilterableStudents] = useState<{ uid: string; name: string; tiers: number[] }[]>([]);
  useEffect(() => {
    if (currentRaid.raidIndexJp === null) {
      return;
    }
    const raidIndexJp = currentRaid.raidIndexJp;
    const loadFilterableStudents = async () => {
      const statistics = await fetchRaidStatisticsByRaid(currentRaid.type, raidIndexJp, defenseType);
      setFilterableStudents(statistics.map(({ studentUid, slotsByTier, assistsByTier }) => {
        if (!allStudents[studentUid]) {
          return null;
        }
        return {
          uid: studentUid,
          name: allStudents[studentUid].name,
          tiers: Array.from(new Set([...slotsByTier.map((slot) => slot.tier), ...assistsByTier.map((assist) => assist.tier)])),
        };
      }).filter((student) => student !== null));
    };
    loadFilterableStudents();
  }, [currentRaid.type, currentRaid.raidIndexJp, defenseType, allStudents]);

  const [rankFilterState, setRankFilterState] = useState<RaidRankFilterState>({
    filterNotOwned: false,
    includeStudents: [],
    excludeStudents: [],
    difficulty: null,
  });

  useEffect(() => {
    setRankFilterState((prev) => ({ ...prev, defenseType, difficulty: null }));
  }, [defenseType]);

  const filterableDifficulties = useMemo(() => {
    const difficulty = currentRaid.defenseTypes.find((dt) => dt.defenseType === defenseType)?.difficulty;
    if (difficulty === Difficulty.Lunatic) {
      return ["lunatic", "torment", "insane"] as DifficultyType[];
    }
    if (difficulty === Difficulty.Torment) {
      return ["torment", "insane"] as DifficultyType[];
    }
    if (difficulty === Difficulty.Insane) {
      return ["insane", "extreme"] as DifficultyType[];
    }
    return [] as DifficultyType[];
  }, [currentRaid.defenseTypes, defenseType]);

  useEffect(() => {
    setPanel({
      title: "편성 찾기",
      description: "특정 학생을 포함/제외한 편성을 찾아보세요",
      Icon: MagnifyingGlassIcon,
      children: (
        <RaidRankFilter
          state={rankFilterState}
          setState={setRankFilterState}
          signedIn={signedIn}
          filterableStudents={filterableStudents}
          filterableDifficulties={filterableDifficulties}
        />
      ),
    });
  }, [rankFilterState, setPanel, signedIn, filterableStudents, filterableDifficulties]);

  return (
    <>
      <RaidRankScreen
        currentRaid={{ boss: currentRaid.boss, since: currentRaid.since, raidType: currentRaid.type, seasonIndex: currentRaid.raidIndexJp, defenseType }}
        filterState={rankFilterState}
        allStudents={allStudents}
        recruitedStudentTiers={recruitedStudentTiers}

        onIncludeStudent={({ uid }) => {
          setRankFilterState((prev) => ({
            ...prev,
            includeStudents: mergeFilteredStudents(prev.includeStudents, { uid, tiers: [] }),
          }));
        }}
        onExcludeStudent={({ uid }) => {
          setRankFilterState((prev) => ({
            ...prev,
            excludeStudents: mergeFilteredStudents(prev.excludeStudents, { uid, tiers: [] }),
          }));
        }}
      />
    </>
  );
}
