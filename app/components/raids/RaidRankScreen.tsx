import { useEffect, useMemo, useState } from "react";
import type { RxDatabase } from "rxdb";
import { IdentificationIcon, MinusCircleIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { getRaidRankDatabase, type RaidRankDocument, syncRaidRank, parseRaidRankDocument, type ParsedRaidRankDocument, initCollection } from "~/models/raid-rank.client";
import { raidRankIdPrefix } from "~/models/raid-rank";
import { EmptyView } from "~/components/atoms/typography";
import { Pagination } from "~/components/atoms/navigation";
import type { RaidType, DefenseType, AttackType, Role } from "~/models/content.d";
import type { RaidRankFilterState } from "./RaidRankFilter";
import { StudentCards } from "~/components/molecules/student";
import { ActionCard } from "~/components/molecules/editor";
import { type Boss, scoreToDifficultyAndTime } from "~/models/raid";

type RaidRankScreenProps = {
  currentRaid: {
    boss: string;
    since: Date;
    raidType: RaidType;
    seasonIndex: number;
    defenseType: DefenseType;
  };
  filterState: RaidRankFilterState;

  onIncludeStudent: (student: { uid: string; tier: number }) => void;
  onExcludeStudent: (student: { uid: string; tier: number }) => void;

  allStudents: {
    [uid: string]: {
      name: string;
      attackType: AttackType;
      defenseType: DefenseType;
      role: Role;
    };
  };
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

function getMaxLevelAt(date: Date): number {
  const dates = Object.keys(maximumLevels).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    if (date >= new Date(dates[i])) {
      return maximumLevels[dates[i]];
    }
  }
  return 70;
}

const ITEMS_PER_PAGE = 10;

export default function RaidRankScreen({ currentRaid, filterState, onIncludeStudent, onExcludeStudent, allStudents }: RaidRankScreenProps) {
  const [db, setDb] = useState<RxDatabase | null>(null);

  const [collectionLoaded, setCollectionLoaded] = useState(false);
  const [initDataLoaded, setInitDataLoaded] = useState(false);

  const [filteredRankIds, setFilteredRankIds] = useState<string[]>([]);
  const [currentPageRanks, setCurrentPageRanks] = useState<ParsedRaidRankDocument[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const [raidIdRange, collectionName] = useMemo(() => {
    const raidPrefix = raidRankIdPrefix(currentRaid.raidType, currentRaid.seasonIndex, currentRaid.defenseType);
    return [raidPrefix * 100000, `ranks-${raidPrefix}`];
  }, [currentRaid]);

  // Initialize the database, collection, and load initial data
  useEffect(() => {
    setCollectionLoaded(false);
    setInitDataLoaded(false);

    setFilteredRankIds([]);
    setCurrentPageRanks([]);

    let cancelled = false;
    let currentDb: RxDatabase | null = null;
    getRaidRankDatabase().then((db) => {
      if (cancelled) {
        return;
      }

      currentDb = db;
      initCollection(db, currentRaid.raidType, currentRaid.seasonIndex, currentRaid.defenseType).then(() => {
        if (cancelled) {
          return;
        }
        setDb(db);
        setCollectionLoaded(true);
        syncRaidRank(db, currentRaid.raidType, currentRaid.seasonIndex, currentRaid.defenseType);
      });
    });

    return () => {
      cancelled = true;
      if (currentDb?.collections[collectionName]) {
        currentDb.collections[collectionName].remove();
      }
    };
  }, [currentRaid.raidType, currentRaid.seasonIndex, currentRaid.defenseType, collectionName, raidIdRange]);

  // Load filtered data
  useEffect(() => {
    if (!db || !collectionLoaded || !db.collections[collectionName]) {
      return;
    }

    const selector: {
      numId: { $gte: number; $lte: number };
      score?: { $gte: number; $lt: number };
    } = { numId: { $gte: raidIdRange + 1, $lte: raidIdRange + 20000 } };

    if (filterState.difficulty) {
      if (filterState.difficulty === "lunatic") {
        selector.score = { $gte: 44025000, $lt: 99999999 };
      } else if (filterState.difficulty === "torment") {
        selector.score = { $gte: 31076000, $lt: 44025000 };
      } else if (filterState.difficulty === "insane") {
        selector.score = { $gte: 19249600, $lt: 31076000 };
      } else if (filterState.difficulty === "extreme") {
        selector.score = { $gte: 0, $lt: 19249600 };
      }
    }

    const query = db.collections[collectionName].find({ selector }).sort({ numId: "asc" });

    let cancelled = false;
    const subscription = query.$.subscribe((ranks: RaidRankDocument[]) => {
      if (cancelled) {
        return;
      }

      const filteredIds: string[] = [];
      const filterByInclusion = filterState.includeStudents.length > 0;
      const filterByExclusion = filterState.excludeStudents.length > 0;
      for (const rank of ranks) {
        // Parse the encoded parties for filtering
        const parsed = parseRaidRankDocument(rank);
        const allStudentSlots = parsed.parties.flatMap((party) => party.slots);

        if (filterByExclusion) {
          const hasExcludedStudent = filterState.excludeStudents.some((excludeStudent) => {
            return allStudentSlots.some((slot) => {
              if (slot.studentUid !== excludeStudent.uid || slot.tier === null) {
                return false;
              }
              return (excludeStudent.tiers.length === 0) || excludeStudent.tiers.includes(slot.tier);
            });
          });

          if (hasExcludedStudent) {
            continue;
          }
        }

        if (filterByInclusion) {
          const allIncluded = filterState.includeStudents.every((includeStudent) => {
            return allStudentSlots.some((slot) => {
              if (slot.studentUid !== includeStudent.uid || slot.tier === null) {
                return false;
              }
              return (includeStudent.tiers.length === 0) || includeStudent.tiers.includes(slot.tier);
            });
          });

          if (!allIncluded) {
            continue;
          }
        }

        filteredIds.push(rank.id);
      }

      setFilteredRankIds(filteredIds);
      setCurrentPage(1);
      setInitDataLoaded(true);
    });

    return () => {
      cancelled = true;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [db, collectionLoaded, collectionName, raidIdRange, filterState]);

  useEffect(() => {
    if (!db || !collectionLoaded || !db.collections[collectionName] || filteredRankIds.length === 0) {
      setCurrentPageRanks([]);
      return;
    }

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageIds = filteredRankIds.slice(startIndex, endIndex);

    Promise.all(pageIds.map((id) => db.collections[collectionName].findOne(id).exec())).then((docs) => {
      const ranks = docs
        .filter((doc) => doc !== null)
        .map((doc) => parseRaidRankDocument(doc));

      setCurrentPageRanks(ranks);
    });
  }, [db, collectionLoaded, collectionName, filteredRankIds, currentPage]);

  if (!db || !collectionLoaded || !initDataLoaded) {
    return <LoadingRanks />;
  }
  if (collectionLoaded && initDataLoaded && filteredRankIds.length === 0) {
    return <EmptyView text="조건에 맞는 순위 정보가 없어요." />;
  }

  // Calculate pagination
  const totalPages = Math.ceil(filteredRankIds.length / ITEMS_PER_PAGE);
  const filteredRanks = currentPageRanks;
  const maxLevel = getMaxLevelAt(currentRaid.since);
  return (
    <div>
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
        const label = `${score.toLocaleString()}점 / ${clearMinutes.toString().padStart(2, "0")}:${clearSeconds.toString().padStart(2, "0")}.${clearMilliseconds.toString().padStart(3, "0")}`
        return (
          <ActionCard
            key={`rank-${rank}`}
            actions={[]}
          >
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
                    popups: student && tier ? [
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
                    ] : undefined,
                    popupId: studentUid ? `${rank}-${party.partyIndex}-${studentUid}` : undefined,
                  };
                })}
                pcGrid={10}
              />
            ))}
          </ActionCard>
        )
      })}

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      {!initDataLoaded && <LoadingRanks />}
    </div>
  );
}

// Spinner animation
function LoadingRanks() {
  return (
    <div className="my-16 flex flex-col justify-center items-center gap-y-4 text-neutral-900 dark:text-neutral-100">
      <div className="animate-spin inline-block size-10 border-3 border-current border-t-transparent rounded-full" role="status" aria-label="loading">
        <span className="sr-only">Loading...</span>
      </div>
      <p>데이터를 불러오고 있어요...</p>
    </div>
  );
}
