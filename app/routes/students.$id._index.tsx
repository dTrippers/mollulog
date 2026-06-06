import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import { BarsArrowDownIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { RaidStatisticsSlotCount } from "~/components/features/raids";
import { RecruitmentHistories } from "~/components/features/students";
import { EmptyView, FilterButtons, LoadingSkeleton, SubTitle } from "~/components/primitives";
import type { Defense } from "~/graphql/graphql";
import { type RaidStatistics, fetchRaidStatisticsByStudent } from "~/lib/ranks/stats";
import { compareInstantAsc, compareInstantDesc, getInstantTime, type UtcIsoString } from "~/lib/date-time";
import { captureClientError } from "~/lib/observability.client";
import type { RaidType, Terrain } from "~/models/content.d";
import { getMaxTierAt } from "~/models/student";
import type { StudentDetailPageContext } from "./students.$id";
import StudentRaidUsageChart from "./students.$id._components/StudentRaidUsageChart";
import StudentGradingChart from "./students.$id._components/StudentGradingChart";

type EnrichedRaidStatistics = Omit<RaidStatistics, "raid"> & {
  raid: {
    raidType: RaidType;
    seasonIndex: number;
    name: string;
    boss: string;
    startAt: UtcIsoString;
    endAt: UtcIsoString;
    terrain: Terrain;
    defenseType: Defense;
    difficulty: string | null;
  };
};

export default function StudentDetail() {
  const { student, recruitments, tagCounts, allGradings, currentUser, allRaids } =
    useOutletContext<StudentDetailPageContext>();
  const [raidShowMore, setRaidShowMore] = useState(false);
  const [sort, setSort] = useState<"recent" | "old">("recent");
  const [statisticsLoading, setStatisticsLoading] = useState(true);

  const enrichRaidStatistics = useMemo(() => {
    return (stats: RaidStatistics[]): EnrichedRaidStatistics[] => {
      return stats
        .map((stat): EnrichedRaidStatistics | null => {
          const raid = allRaids.find(
            (currentRaid) =>
              currentRaid.raidType === stat.raid.raidType && currentRaid.jpSchedule?.seasonIndex === stat.raid.season,
          );
          if (!raid || !raid.startAt || !raid.endAt) {
            return null;
          }

          if (Number.isNaN(getInstantTime(raid.startAt)) || Number.isNaN(getInstantTime(raid.endAt))) {
            return null;
          }

          const defenseTypeSet = raid.defenseTypeSets.find(
            ({ primaryDefenseType }) => primaryDefenseType === stat.raid.defenseType,
          );
          const difficulty = defenseTypeSet?.difficulty ?? null;
          return {
            ...stat,
            raid: {
              raidType: raid.raidType as RaidType,
              seasonIndex: raid.seasonIndex,
              name: raid.raidBoss.name,
              boss: raid.raidBoss.uid,
              startAt: raid.startAt,
              endAt: raid.endAt,
              terrain: raid.terrain as Terrain,
              defenseType: stat.raid.defenseType,
              difficulty,
            },
          };
        })
        .filter((stat): stat is EnrichedRaidStatistics => stat !== null);
    };
  }, [allRaids]);

  const [rawStatistics, setRawStatistics] = useState<RaidStatistics[]>([]);
  const [statistics, setStatistics] = useState<EnrichedRaidStatistics[]>([]);
  useEffect(() => {
    let cancelled = false;
    const loadStatistics = async () => {
      try {
        const rawStatistics = await fetchRaidStatisticsByStudent(student.uid);
        if (cancelled) {
          return;
        }
        setRawStatistics(rawStatistics);
        setStatistics(enrichRaidStatistics(rawStatistics));
      } catch (error) {
        captureClientError(error, {
          source: "student.raid_statistics",
          studentUid: student.uid,
        });
      } finally {
        if (!cancelled) {
          setStatisticsLoading(false);
        }
      }
    };
    loadStatistics();
    return () => {
      cancelled = true;
    };
  }, [enrichRaidStatistics, student.uid]);

  const listedStatistics = useMemo(() => {
    return statistics.filter((stat) => stat.slotsCount > 100).sort((a, b) => {
      if (sort === "recent") {
        return compareInstantDesc(a.raid.startAt, b.raid.startAt);
      }
      return compareInstantAsc(a.raid.startAt, b.raid.startAt);
    });
  }, [statistics, sort]);

  const filteredStatistics = useMemo(() => {
    const sorted = listedStatistics;
    return raidShowMore ? sorted : sorted.slice(0, 5);
  }, [listedStatistics, raidShowMore]);

  const highlightedGradings = (() => {
    const currentUserGrading = allGradings.find(
      (grading) => currentUser && grading.user.username === currentUser.username,
    );
    if (currentUserGrading) {
      return [currentUserGrading];
    }
    return allGradings.slice(0, 1);
  })();

  return (
    <>
      <div className="mt-8">
        <SubTitle text="학생 평가 요약" />
      </div>
      <StudentGradingChart
        student={student}
        tagCounts={tagCounts}
        noGrading={allGradings.length === 0}
        signedIn={currentUser !== null}
        recentReview={highlightedGradings[0]}
        recentReviewIsCurrentUser={!!currentUser && highlightedGradings[0]?.user?.username === currentUser.username}
        hasCurrentUserGrading={
          !!currentUser && allGradings.some((grading) => grading.user.username === currentUser.username)
        }
        totalReviewCount={allGradings.length}
      />

      <div className="mt-10">
        <SubTitle text="총력전/대결전 통계" />
      </div>
      <div className="mt-4">
        {statisticsLoading ? (
          <LoadingSkeleton />
        ) : statistics.length === 0 ? (
          <EmptyView text="편성된 총력전/대결전 정보가 없어요" />
        ) : (
          <>
            <StudentRaidUsageChart
              attackType={student.attackType}
              releaseAt={student.releaseAt}
              raids={allRaids}
              statistics={rawStatistics}
            />
            <FilterButtons
              Icon={BarsArrowDownIcon}
              buttonProps={[
                {
                  text: "최신순",
                  onToggle: () => setSort("recent"),
                  active: sort === "recent",
                },
                {
                  text: "과거순",
                  onToggle: () => setSort("old"),
                  active: sort === "old",
                },
              ]}
              exclusive
              atLeastOne
            />
          </>
        )}
        {!statisticsLoading && statistics.length > 0 && listedStatistics.length === 0 && (
          <div className="mt-4">
            <EmptyView text="100회를 초과해 편성된 총력전/대결전 정보가 없어요" />
          </div>
        )}
        {filteredStatistics.map((stat) => {
          const { raid, slotsByTier, slotsCount, assistsCount, assistsByTier } = stat;
          return (
            <RaidStatisticsSlotCount
              key={`${raid.raidType}-${raid.seasonIndex}-${raid.defenseType}`}
              raid={raid}
              slotsCount={slotsCount}
              slotsByTier={slotsByTier}
              assistsCount={assistsCount}
              assistsByTier={assistsByTier}
              maxTier={getMaxTierAt(raid.startAt)}
            />
          );
        })}
        {listedStatistics.length > 5 && (
          <button
            type="button"
            className="mb-4 flex w-full items-center justify-center py-2 text-center hover:underline"
            onClick={() => setRaidShowMore(!raidShowMore)}
          >
            {raidShowMore ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
            <span className="ml-1">{raidShowMore ? "접기" : "더 보기"}</span>
          </button>
        )}
      </div>

      {recruitments.length > 0 && (
        <div className="mt-10">
          <SubTitle text="모집 일정" />
          <RecruitmentHistories recruitments={recruitments} />
        </div>
      )}
    </>
  );
}
