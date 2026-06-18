import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { useEffect, useMemo, useState } from "react";
import { Link, type LoaderFunctionArgs, useLoaderData, useOutletContext } from "react-router";
import { RaidListItem } from "~/components/features/raids";
import RaidClearLevels from "~/components/features/raids/RaidClearLevels";
import RaidOftenUsedParties from "~/components/features/raids/RaidOftenUsedParties";
import RaidStatisticsSlotCount from "~/components/features/raids/RaidStatisticsSlotCount";
import { EmptyView, HorizontalScroll, LoadingSkeleton, Section } from "~/components/primitives";
import { fetchRaidOverview } from "~/lib/ranks/overview";
import { type RaidStatistics, fetchRaidStatisticsByRaid } from "~/lib/ranks/stats";
import type { RaidType } from "~/models/content.d";
import { getRaidDefenseTypeSetKey, raidTypeToParam } from "~/models/raid";
import { getSameOccurrenceRaids } from "~/models/raid-group";
import { getMaxTierAt } from "~/models/student";
import { getAllStudentsMap } from "~/models/student";
import type { RaidPageContext } from "./raids.$raidType.$seasonIndex";
import RaidUnavailableState from "./raids.$raidType.$seasonIndex._components/RaidUnavailableState";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const rawAllStudents = await getAllStudentsMap(env, true);
  const allStudents = Object.fromEntries(
    Object.entries(rawAllStudents).map(([uid, student]) => [
      uid,
      {
        name: student.name,
        role: student.role,
        attackType: student.attackType,
        defenseType: student.defenseType,
      },
    ]),
  );

  return {
    allStudents,
  };
};

export default function RaidSummary() {
  const { currentRaid, allRaids, defenseType, defenseTypeSet } = useOutletContext<RaidPageContext>();
  const { allStudents } = useLoaderData<typeof loader>();
  const maxTier = currentRaid.startAt ? getMaxTierAt(currentRaid.startAt) : null;
  const raidPath = `/raids/${raidTypeToParam(currentRaid.raidType)}/${currentRaid.seasonIndex}`;

  // Past hostings of the same boss + terrain (excluding current raid)
  const sameBossRaids = useMemo(() => getSameOccurrenceRaids(allRaids, currentRaid), [allRaids, currentRaid]);

  const [statistics, setStatistics] = useState<RaidStatistics[] | null>(null);
  const [clearLevels, setClearLevels] = useState<Record<string, number> | null>(null);
  const [oftenUsedParties, setOftenUsedParties] = useState<Array<{
    count: number;
    maxRank: number;
    maxScore: number;
    parties: Array<{
      students: Array<{
        slot: "student" | "empty";
        student?: {
          uid: string;
          level: number;
          tier: number;
          weaponTier?: number;
          isAssist?: boolean;
        };
        empty?: Record<string, never>;
      }>;
    }>;
  }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const jpSeasonIndex = currentRaid.jpSchedule?.seasonIndex ?? null;

  useEffect(() => {
    if (jpSeasonIndex === null) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load both student statistics and overview data in parallel
        const [raidStatistics, overviewData] = await Promise.all([
          fetchRaidStatisticsByRaid(currentRaid.raidType as RaidType, jpSeasonIndex, defenseType),
          fetchRaidOverview({ raidType: currentRaid.raidType as RaidType, season: jpSeasonIndex, defenseType }),
        ]);
        if (cancelled) {
          return;
        }

        setStatistics(raidStatistics);

        // Convert clear_levels from string keys to numbers
        const clearLevelsMap: Record<string, number> = {};
        if (overviewData.clearLevels) {
          for (const [difficulty, count] of Object.entries(overviewData.clearLevels)) {
            clearLevelsMap[difficulty] = Number(count);
          }
        }
        setClearLevels(clearLevelsMap);

        // Convert often_used_parties
        const partiesData = (overviewData.oftenUsedParties || []).map((party) => ({
          count: Number(party.count),
          maxRank: Number(party.maxRank || 0),
          maxScore: Number(party.maxScore || 0),
          parties: party.parties || [],
        }));
        setOftenUsedParties(partiesData);

        setLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load statistics");
        setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [currentRaid.raidType, jpSeasonIndex, defenseType]);

  const top6Statistics = useMemo(() => {
    if (!statistics || statistics.length === 0) {
      return [];
    }
    const sorted = [...statistics].sort((a, b) => b.slotsCount + b.assistsCount - (a.slotsCount + a.assistsCount));
    return sorted.slice(0, 6);
  }, [statistics]);

  if (jpSeasonIndex === null) {
    return <RaidUnavailableState />;
  }

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <EmptyView text={`오류가 발생했어요: ${error}`} />;
  }

  if (!statistics || statistics.length === 0) {
    return <EmptyView text="통계 정보를 준비중이에요" />;
  }

  return (
    <div className="py-4">
      {sameBossRaids.length > 0 && (
        <Section title="역대 개최 이력" description="동일 보스의 최근 총력전/대결전 개최 이력">
          <HorizontalScroll itemWidth={{ mobile: "w-[86%]", desktop: "md:w-2/5" }} gap="gap-3">
            {sameBossRaids.map((raid) => {
              const hasMatchingDefenseType = raid.defenseTypeSets.some(
                ({ primaryDefenseType }) => primaryDefenseType === defenseType,
              );

              const actions = [
                { text: "시즌 정보", to: `/raids/${raidTypeToParam(raid.raidType)}/${raid.seasonIndex}` },
              ];
              if (hasMatchingDefenseType) {
                actions.push({
                  text: "비교",
                  to: `${raidPath}/compare?from=${raid.uid}&defenseType=${defenseType}&defenseTypeSet=${getRaidDefenseTypeSetKey(defenseTypeSet)}`,
                });
              }

              return (
                <RaidListItem
                  key={raid.uid}
                  raid={raid}
                  actions={actions}
                  className="border border-neutral-200 shadow-sm dark:border-neutral-700"
                />
              );
            })}
          </HorizontalScroll>
        </Section>
      )}

      {clearLevels && (
        <Section title="플래티넘 클리어 난이도" description="플래티넘(상위 2만명) 클리어의 난이도 분포">
          <RaidClearLevels clearLevels={clearLevels} />
        </Section>
      )}

      {oftenUsedParties && oftenUsedParties.length > 0 && (
        <Section title="많이 사용된 편성 TOP 5" description="플래티넘(상위 2만명)에서 가장 많이 사용된 편성">
          <RaidOftenUsedParties oftenUsedParties={oftenUsedParties} allStudents={allStudents} />
          <Link to={`${raidPath}/ranks`}>
            <div className="my-4 py-2 flex items-center justify-center text-sm hover:underline">
              <span>모든 편성 보기</span>
              <ChevronRightIcon className="size-4" />
            </div>
          </Link>
        </Section>
      )}

      <Section title="출전 횟수 TOP 6" description="플래티넘(상위 2만명)에서 출전한 학생들의 편성 횟수">
        <div className="relative">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            {top6Statistics.map(({ studentUid, slotsCount, slotsByTier, assistsCount, assistsByTier }) => {
              const student = allStudents[studentUid];
              return (
                <div key={studentUid} className="-my-2">
                  <RaidStatisticsSlotCount
                    student={{ uid: studentUid, name: student.name }}
                    slotsCount={slotsCount}
                    slotsByTier={slotsByTier}
                    assistsCount={assistsCount}
                    assistsByTier={assistsByTier}
                    maxTier={maxTier ?? 8}
                  />
                </div>
              );
            })}
          </div>
          <Link to={`${raidPath}/statistics`}>
            <div className="my-4 py-2 flex items-center justify-center text-sm hover:underline">
              <span>모두 보기 ({statistics.length - 5}개)</span>
              <ChevronRightIcon className="size-4" />
            </div>
          </Link>
        </div>
      </Section>
    </div>
  );
}
