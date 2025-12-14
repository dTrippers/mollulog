import { useEffect, useMemo, useState } from "react";
import { type LoaderFunctionArgs, useLoaderData, useOutletContext } from "react-router";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { ClockIcon } from "@heroicons/react/24/solid";
import RaidRankFilter, { mergeFilteredStudents, type RaidRankFilterState } from "~/components/raids/RaidRankFilter";
import { RaidRankScreen } from "~/components/raids";
import type { RaidPageContext } from "./raids.$id";
import { raidTypeLocale } from "~/locales/ko";
import { getAllStudentsMap } from "~/models/student";
import { Difficulty } from "~/graphql/graphql";
import type { Difficulty as DifficultyType } from "~/models/raid";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const rawAllStudents = await getAllStudentsMap(env, true);
  const allStudents = Object.fromEntries(Object.entries(rawAllStudents).map(([uid, student]) => [uid, {
    name: student.name,
    attackType: student.attackType,
    defenseType: student.defenseType,
    role: student.role,
  }]));
  return {
    allStudents,
  };
};

export default function RaidDetail() {
  const { currentRaid, defenseType, setPanel, signedIn } = useOutletContext<RaidPageContext>();
  const { allStudents } = useLoaderData<typeof loader>();

  if (!currentRaid.rankVisible || currentRaid.raidIndexJp === null) {
    return (
      <div className="my-16 md:my-48 w-full flex flex-col items-center justify-center">
        <ClockIcon className="my-2 w-16 h-16" strokeWidth={2} />
        <p className="my-2 text-2xl font-bold">{raidTypeLocale[currentRaid.type]} 정보를 준비중이에요</p>
        <p className="my-2 text-neutral-500 dark:text-neutral-400">
          정보가 준비된 컨텐츠를 선택하여 확인해보세요
        </p>
      </div>
    )
  }

  // Get all students for current raid
  const filterableStudents = useMemo(() => {
    const resultsMap = new Map<string, { uid: string; name: string; tiers: number[] }>();
    for (const { student, slotsByTier, assistsByTier } of currentRaid.statistics) {
      const tiers = Array.from(
        new Set([...slotsByTier.map((slot) => slot.tier), ...assistsByTier.map((assist) => assist.tier)]),
      );

      const existing = resultsMap.get(student.uid);
      if (existing) {
        resultsMap.set(
          student.uid,
          { uid: student.uid, name: student.name, tiers: Array.from(new Set([...existing.tiers, ...tiers])) },
        );
      } else {
        resultsMap.set(student.uid, { uid: student.uid, name: student.name, tiers });
      }
    }
    return Array.from(resultsMap.values());
  }, [currentRaid.uid]);

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
    } else if (difficulty === Difficulty.Torment) {
      return ["torment", "insane"] as DifficultyType[];
    } else if (difficulty === Difficulty.Insane) {
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
  }, [defenseType, rankFilterState, setPanel, signedIn, filterableStudents, filterableDifficulties]);

  return (
    <>
      <RaidRankScreen
        currentRaid={{ boss: currentRaid.boss, since: currentRaid.since, raidType: currentRaid.type, seasonIndex: currentRaid.raidIndexJp, defenseType }}
        filterState={rankFilterState}
        allStudents={allStudents}

        onIncludeStudent={({ uid, tier }) => {
          setRankFilterState((prev) => ({
            ...prev,
            includeStudents: mergeFilteredStudents(prev.includeStudents, { uid, tiers: [tier] }),
          }));
        }}
        onExcludeStudent={({ uid, tier }) => {
          setRankFilterState((prev) => ({
            ...prev,
            excludeStudents: mergeFilteredStudents(prev.excludeStudents, { uid, tiers: [tier] }),
          }));
        }}
      />
    </>
  );
}
