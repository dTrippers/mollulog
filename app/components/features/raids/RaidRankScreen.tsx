import { IdentificationIcon, MinusCircleIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionCard } from "~/components/features/editor";
import { StudentCards } from "~/components/features/students";
import { EmptyView, Pagination } from "~/components/primitives";
import type { Attack, Defense } from "~/graphql/graphql";
import { type ParsedRaidRankDocument, convertTier, fetchRanks } from "~/lib/ranks/ranks";
import type { UtcIsoString } from "~/lib/date-time";
import type { RaidType, Role } from "~/models/content.d";
import { type Boss, scoreToDifficultyAndTime } from "~/models/raid";
import type { RaidRankFilterState } from "./RaidRankFilter";

type RaidRankScreenProps = {
  currentRaid: {
    boss: string;
    since: UtcIsoString | Date;
    raidType: RaidType;
    seasonIndex: number;
    defenseType: Defense;
  };
  filterState: RaidRankFilterState;

  onIncludeStudent: (student: { uid: string; tier: number }) => void;
  onExcludeStudent: (student: { uid: string; tier: number }) => void;

  allStudents: {
    [uid: string]: {
      name: string;
      attackType: Attack;
      defenseType: Defense;
      role: Role;
    };
  };
  recruitedStudentTiers: Record<string, number>;
};

const maximumLevels: Record<string, number> = {
  "2021-11-09": 70,
  "2022-03-22": 73,
  "2022-05-17": 75,
  "2022-09-06": 78,
  "2022-12-20": 80,
  "2023-03-28": 83,
  "2023-07-25": 85,
  "2024-01-30": 88,
  "2024-07-23": 90,
};

function getMaxLevelAt(date: UtcIsoString | Date): number {
  const targetDate = date instanceof Date ? date : new Date(date);
  const dates = Object.keys(maximumLevels).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    if (targetDate >= new Date(dates[i])) {
      return maximumLevels[dates[i]];
    }
  }
  return 70;
}

const ITEMS_PER_PAGE = 10;

function getScoreRange(difficulty: string | null): { gte?: number; lt?: number } | undefined {
  if (!difficulty) return undefined;
  if (difficulty === "lunatic") {
    return { gte: 44025000, lt: 99999999 };
  }
  if (difficulty === "torment") {
    return { gte: 31076000, lt: 44025000 };
  }
  if (difficulty === "insane") {
    return { gte: 19249600, lt: 31076000 };
  }
  if (difficulty === "extreme") {
    return { gte: 0, lt: 19249600 };
  }
  return undefined;
}

export default function RaidRankScreen({
  currentRaid,
  filterState,
  onIncludeStudent,
  onExcludeStudent,
  allStudents,
  recruitedStudentTiers,
}: RaidRankScreenProps) {
  const [ranks, setRanks] = useState<ParsedRaidRankDocument[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousResetKeyRef = useRef<string | null>(null);

  const apiFilter = useMemo(() => {
    // Convert includeStudents: tiers 배열을 [tier, weaponTier?] 형식으로 변환
    // tiers가 빈 배열이면 tiers: [] (모든 tier 의미)
    const includeStudents = filterState.includeStudents.map((s) => {
      if (s.tiers.length === 0) {
        return { uid: s.uid, tiers: [] };
      }
      // 기존 total tier를 [tier, weaponTier?] 형식으로 변환
      const tiers: Array<[number] | [number, number]> = s.tiers.map((totalTier) => {
        const { tier, weaponTier } = convertTier(totalTier);
        if (weaponTier !== undefined && weaponTier > 0) {
          return [tier, weaponTier];
        }
        return [tier];
      });
      return { uid: s.uid, tiers };
    });

    // Convert excludeStudents: tiers 배열을 [tier, weaponTier?] 형식으로 변환
    // tiers가 빈 배열이면 tiers: [] (모든 tier 의미)
    const excludeStudents = filterState.excludeStudents.map((s) => {
      if (s.tiers.length === 0) {
        return { uid: s.uid, tiers: [] };
      }
      // 기존 total tier를 [tier, weaponTier?] 형식으로 변환
      const tiers: Array<[number] | [number, number]> = s.tiers.map((totalTier) => {
        const { tier, weaponTier } = convertTier(totalTier);
        if (weaponTier !== undefined && weaponTier > 0) {
          return [tier, weaponTier];
        }
        return [tier];
      });
      return { uid: s.uid, tiers };
    });

    // If filterNotOwned is enabled, add all unowned students to excludeStudents
    if (filterState.filterNotOwned) {
      const unownedStudentUids = Object.keys(allStudents).filter((uid) => !recruitedStudentTiers[uid]);

      // Add unowned students to excludeStudents (avoid duplicates)
      const existingExcludeUids = new Set(excludeStudents.map((s) => s.uid));
      for (const uid of unownedStudentUids) {
        if (!existingExcludeUids.has(uid)) {
          excludeStudents.push({ uid, tiers: [] }); // tiers: [] means all tiers
        }
      }
    }

    return {
      includeStudents,
      excludeStudents,
      score: getScoreRange(filterState.difficulty),
    };
  }, [
    allStudents,
    filterState.difficulty,
    filterState.excludeStudents,
    filterState.filterNotOwned,
    filterState.includeStudents,
    recruitedStudentTiers,
  ]);

  const resetKey = JSON.stringify({
    raidType: currentRaid.raidType,
    seasonIndex: currentRaid.seasonIndex,
    defenseType: currentRaid.defenseType,
    apiFilter,
  });

  useEffect(() => {
    let cancelled = false;

    if (previousResetKeyRef.current !== null && previousResetKeyRef.current !== resetKey && currentPage !== 1) {
      previousResetKeyRef.current = resetKey;
      setLoading(true);
      setError(null);
      setCurrentPage(1);
      return;
    }

    previousResetKeyRef.current = resetKey;
    setLoading(true);
    setError(null);

    const loadRanks = async () => {
      try {
        const { includeStudents, excludeStudents } = apiFilter;

        const result = await fetchRanks({
          raidType: currentRaid.raidType,
          season: currentRaid.seasonIndex,
          defenseType: currentRaid.defenseType,
          score: apiFilter.score,
          includeStudents,
          excludeStudents,
          perPage: ITEMS_PER_PAGE,
          page: currentPage,
        });

        if (cancelled) {
          return;
        }

        setRanks(result.ranks);
        setTotalCount(result.totalCount);
        setLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load ranks");
        setLoading(false);
      }
    };

    loadRanks();

    return () => {
      cancelled = true;
    };
  }, [apiFilter, currentPage, currentRaid.defenseType, currentRaid.raidType, currentRaid.seasonIndex, resetKey]);

  if (loading) {
    return <LoadingRanks />;
  }

  if (error) {
    return <EmptyView text={`오류가 발생했어요: ${error}`} />;
  }

  if (ranks.length === 0) {
    return <EmptyView text="조건에 맞는 순위 정보가 없어요." />;
  }

  // Calculate pagination
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const filteredRanks = ranks;
  const maxLevel = getMaxLevelAt(currentRaid.since);
  return (
    <div className="max-w-2xl">
      {filteredRanks.map(({ rank, score, parties }) => {
        let clearTimeMillisec: number | undefined = undefined;
        try {
          clearTimeMillisec = scoreToDifficultyAndTime(currentRaid.boss as Boss, score).clearTimeMillisec;
        } catch (error) {
          clearTimeMillisec = 0;
          // Timing issue can be ignored
        }

        const clearMinutes = Math.floor(clearTimeMillisec / 60000);
        const clearSeconds = Math.floor((clearTimeMillisec % 60000) / 1000);
        const clearMilliseconds = clearTimeMillisec % 1000;
        const label = `${score.toLocaleString()}점 / ${clearMinutes.toString().padStart(2, "0")}:${clearSeconds.toString().padStart(2, "0")}.${clearMilliseconds.toString().padStart(3, "0")}`;
        return (
          <ActionCard key={`rank-${rank}-${score}`} actions={[]}>
            <p className="mb-2">
              <span className="md:text-lg font-bold">{rank}위</span> ({label})
            </p>
            {parties.map((party) => (
              <StudentCards
                key={`party-${party.partyIndex}`}
                students={party.slots.map(({ studentUid, tier, level, isAssist }) => {
                  if (!studentUid) {
                    return { uid: null };
                  }

                  const student = allStudents[studentUid];
                  if (!student) {
                    return { uid: null };
                  }

                  return {
                    uid: studentUid,
                    name: student.name,
                    hideName: true,
                    attackType: student.attackType,
                    defenseType: student.defenseType,
                    role: student.role,
                    tier,
                    level: level && level < maxLevel ? level : undefined,
                    isAssist,
                    popups:
                      student && tier
                        ? [
                            {
                              Icon: PlusCircleIcon,
                              text: "이 학생을 포함한 편성만 보기",
                              onClick: () => onIncludeStudent({ uid: studentUid, tier }),
                            },
                            {
                              Icon: MinusCircleIcon,
                              text: "이 학생을 제외한 편성만 보기",
                              onClick: () => onExcludeStudent({ uid: studentUid, tier }),
                            },
                            {
                              Icon: IdentificationIcon,
                              text: "학생부 보기 (평가/통계)",
                              link: `/students/${studentUid}`,
                            },
                          ]
                        : undefined,
                    popupId: studentUid ? `${rank}-${party.partyIndex}-${studentUid}` : undefined,
                  };
                })}
                pcGrid={10}
              />
            ))}
          </ActionCard>
        );
      })}

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
    </div>
  );
}

// Spinner animation
function LoadingRanks() {
  return (
    <div className="my-16 flex flex-col justify-center items-center gap-y-4 text-neutral-900 dark:text-neutral-100">
      <div
        className="animate-spin inline-block size-10 border-3 border-current border-t-transparent rounded-full"
        aria-label="loading"
      >
        <span className="sr-only">Loading...</span>
      </div>
      <p>데이터를 불러오고 있어요...</p>
    </div>
  );
}
