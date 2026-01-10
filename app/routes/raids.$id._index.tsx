import { useEffect, useMemo, useState } from "react";
import { Link, type LoaderFunctionArgs, useLoaderData, useOutletContext } from "react-router";
import { ChevronRightIcon } from "@heroicons/react/16/solid";
import dayjs from "dayjs";
import { LoadingSkeleton } from "~/components/atoms/layout";
import { EmptyView } from "~/components/atoms/typography";
import { OptionBadge } from "~/components/atoms/student";
import RaidStatisticsSlotCount from "~/components/raids/RaidStatisticsSlotCount";
import RaidClearLevels from "~/components/raids/RaidClearLevels";
import RaidOftenUsedParties from "~/components/raids/RaidOftenUsedParties";
import { Section } from "~/components/ui/Section";
import { getMaxTierAt } from "~/models/student";
import { getAllStudentsMap } from "~/models/student";
import { fetchStudentStatistics, convertStatisticsToClientFormat } from "~/models/raid-statistics.client";
import { fetchRaidOverview } from "~/models/raid-overview.client";
import { terrainLocale, defenseTypeLocale, difficultyLocale, defenseTypeColor, raidTypeLocale } from "~/locales/ko";
import type { RaidPageContext } from "./raids.$id";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const rawAllStudents = await getAllStudentsMap(env, true);
  const allStudents = Object.fromEntries(Object.entries(rawAllStudents).map(([uid, student]) => [uid, {
    name: student.name,
    role: student.role,
    attackType: student.attackType,
    defenseType: student.defenseType,
  }]));

  return {
    allStudents,
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

export default function RaidSummary() {
  const { currentRaid, allRaids, defenseType } = useOutletContext<RaidPageContext>();
  const { allStudents } = useLoaderData<typeof loader>();
  const maxTier = getMaxTierAt(currentRaid.since);

  // Filter raids with the same boss (excluding current raid)
  const sameBossRaids = useMemo(() => {
    return allRaids
      .filter((raid) => raid.boss === currentRaid.boss && raid.rankVisible && raid.uid !== currentRaid.uid)
      .sort((a, b) => dayjs(a.since).diff(dayjs(b.since)));
  }, [allRaids, currentRaid.boss, currentRaid.uid]);

  const [statistics, setStatistics] = useState<Array<{
    student: { uid: string; name: string; role: string };
    slotsCount: number;
    slotsByTier: { tier: number; count: number }[];
    assistsCount: number;
    assistsByTier: { tier: number; count: number }[];
  }> | null>(null);
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

  useEffect(() => {
    if (!currentRaid.rankVisible || currentRaid.raidIndexJp === null) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load both student statistics and overview data in parallel
        const [serverStats, overviewData] = await Promise.all([
          fetchStudentStatistics({
            raidType: currentRaid.type,
            season: currentRaid.raidIndexJp!,
            defenseType,
          }),
          fetchRaidOverview({
            raidType: currentRaid.type,
            season: currentRaid.raidIndexJp!,
            defenseType,
          }),
        ]);

        if (cancelled) {
          return;
        }

        const convertedStats = convertStatisticsToClientFormat(serverStats, allStudents);
        setStatistics(convertedStats);

        // Convert clear_levels from string keys to numbers
        const clearLevelsMap: Record<string, number> = {};
        if (overviewData.clearLevels) {
          Object.entries(overviewData.clearLevels).forEach(([difficulty, count]) => {
            clearLevelsMap[difficulty] = Number(count);
          });
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
  }, [currentRaid.type, currentRaid.raidIndexJp, currentRaid.rankVisible, defenseType, allStudents]);

  const top6Statistics = useMemo(() => {
    if (!statistics || statistics.length === 0) {
      return [];
    }
    const sorted = [...statistics].sort((a, b) => (b.slotsCount + b.assistsCount) - (a.slotsCount + a.assistsCount));
    return sorted.slice(0, 6);
  }, [statistics]);

  if (!currentRaid.rankVisible || currentRaid.raidIndexJp === null) {
    return (
      <div className="my-16 md:my-48 w-full flex flex-col items-center justify-center">
        <p className="my-2 text-2xl font-bold">정보를 준비중이에요</p>
        <p className="my-2 text-neutral-500 dark:text-neutral-400">
          정보가 준비된 컨텐츠를 선택하여 확인해보세요
        </p>
      </div>
    );
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
    <div>
      {clearLevels && (
        <Section
          title="플래티넘 클리어 난이도"
          description="플래티넘(상위 2만명) 클리어의 난이도 분포"
        >
          <RaidClearLevels clearLevels={clearLevels} />
        </Section>
      )}

      {oftenUsedParties && oftenUsedParties.length > 0 && (
        <Section
          title="많이 사용된 편성 TOP 5"
          description="플래티넘(상위 2만명)에서 가장 많이 사용된 편성"
        >
          <RaidOftenUsedParties
            oftenUsedParties={oftenUsedParties}
            allStudents={allStudents}
          />
          <Link to={`/raids/${currentRaid.uid}/ranks`}>
            <div className="my-4 py-2 flex items-center justify-center text-sm hover:underline">
              <span>모든 편성 보기</span>
              <ChevronRightIcon className="size-4" />
            </div>
          </Link>
        </Section>
      )}

      <Section
        title="출전 횟수 TOP 6"
        description="플래티넘(상위 2만명)에서 출전한 학생들의 편성 횟수"
      >
        <div className="relative">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            {top6Statistics.map(({ student, slotsCount, slotsByTier, assistsCount, assistsByTier }) => (
              <div key={student.uid} className="-my-2">
                <RaidStatisticsSlotCount
                  student={student}
                  slotsCount={slotsCount}
                  slotsByTier={slotsByTier}
                  assistsCount={assistsCount}
                  assistsByTier={assistsByTier}
                  maxTier={maxTier}
                />
              </div>
            ))}
          </div>
          <Link to={`/raids/${currentRaid.uid}/statistics`}>
            <div className="my-4 py-2 flex items-center justify-center text-sm hover:underline">
              <span>모두 보기 ({statistics.length - 5}개)</span>
              <ChevronRightIcon className="size-4" />
            </div>
          </Link>
        </div>
      </Section>

      {sameBossRaids.length > 0 && (
        <Section title="최근 개최 이력" description="동일 보스의 최근 총력전/대결전 개최 이력">
          <div className="space-y-2">
            {sameBossRaids.map((raid) => {
              // Check if current raid and comparison raid have the same defense type as the currently selected one
              const hasMatchingDefenseType = raid.defenseTypes.some(({ defenseType: raidDt }) => raidDt === defenseType);

              return (
                <div key={raid.uid} className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700">
                  <div className="p-3 md:p-4">
                    <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mb-1">
                      {raidTypeLocale[raid.type]} · {dayjs(raid.since).format("YYYY/M/D")} ~ {dayjs(raid.until).format("M/D")}
                    </p>
                    <div className="flex gap-1 flex-wrap mb-3">
                      <OptionBadge text={terrainLocale[raid.terrain]} />
                      {raid.defenseTypes.map(({ defenseType: dt, difficulty }) => (
                        <OptionBadge
                          key={dt}
                          text={`${defenseTypeLocale[dt]}${difficulty ? ` · ${difficultyLocale[difficulty]}` : ""}`}
                          color={defenseTypeColor[dt]}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Link
                        to={`/raids/${raid.uid}`}
                        className="inline-block px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-white dark:bg-neutral-900/20 hover:bg-neutral-100 dark:hover:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-800 rounded-md transition whitespace-nowrap"
                      >
                        시즌 정보 보기
                      </Link>
                      {hasMatchingDefenseType && (
                        <Link
                          to={`/raids/${currentRaid.uid}/compare?from=${raid.uid}&defenseType=${defenseType}`}
                          className="inline-block px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-white dark:bg-neutral-900/20 hover:bg-neutral-100 dark:hover:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-800 rounded-md transition whitespace-nowrap"
                        >
                          시즌 비교
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
