import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { ClockIcon } from "@heroicons/react/24/solid";
import RaidRankFilter, { mergeFilteredStudents, RaidRankFilterState } from "~/components/raids/RaidRankFilter";
import { RaidRankScreen } from "~/components/raids";
import type { RaidPageContext } from "./raids.$id";
import { raidTypeLocale } from "~/locales/ko";

export default function RaidDetail() {
  const { currentRaid, defenseType, setPanel, signedIn } = useOutletContext<RaidPageContext>();
  if (!currentRaid.rankVisible) {
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
    defenseType,
    filterNotOwned: false,
    includeStudents: [],
    excludeStudents: [],
    rankAfter: null,
    rankBefore: null,
  });
  useEffect(() => {
    setRankFilterState((prev) => ({ ...prev, defenseType }));
  }, [defenseType]);

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
        />
      ),
    });
  }, [rankFilterState, setPanel]);
  

  return (
    <>
      <RaidRankScreen
        currentRaid={currentRaid}
        filterState={rankFilterState}
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
        onNext={(rank) => {
          setRankFilterState((prev) => ({ ...prev, rankBefore: null, rankAfter: rank }));
        }}
        onPrev={(rank) => {
          setRankFilterState((prev) => ({ ...prev, rankAfter: null, rankBefore: rank }));
        }}
      />
    </>
  );
}
