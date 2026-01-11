import { useEffect, useState } from "react";
import { type LoaderFunctionArgs, useLoaderData, useOutletContext } from "react-router";
import { LoadingSkeleton } from "~/components/atoms/layout";
import { EmptyView } from "~/components/atoms/typography";
import RaidStatisticsScreen from "~/components/raids/RaidStatisticsScreen";
import { getMaxTierAt } from "~/models/student";
import { getAllStudentsMap } from "~/models/student";
import { fetchRaidStatisticsByRaid, type RaidStatistics } from "~/models/raid-statistics.client";
import type { RaidPageContext } from "./raids.$id";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const rawAllStudents = await getAllStudentsMap(env, true);
  const allStudents = Object.fromEntries(Object.entries(rawAllStudents).map(([uid, student]) => [uid, {
    name: student.name,
    role: student.role,
  }]));

  return {
    allStudents,
  };
};

export default function RaidStatistics() {
  const { currentRaid, defenseType } = useOutletContext<RaidPageContext>();
  const { allStudents } = useLoaderData<typeof loader>();
  const maxTier = getMaxTierAt(currentRaid.since);

  const [statistics, setStatistics] = useState<RaidStatistics[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentRaid.rankVisible || currentRaid.raidIndexJp === null) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadStatistics = async () => {
      try {
        setLoading(true);
        setError(null);

        const rawStatistics = await fetchRaidStatisticsByRaid(currentRaid.type, currentRaid.raidIndexJp!, defenseType);
        if (cancelled) {
          return;
        }

        setStatistics(rawStatistics);
        setLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load statistics");
        setLoading(false);
      }
    };

    loadStatistics();

    return () => {
      cancelled = true;
    };
  }, [currentRaid.type, currentRaid.raidIndexJp, currentRaid.rankVisible, defenseType, allStudents]);

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
    <RaidStatisticsScreen statistics={statistics} allStudents={allStudents} maxTier={maxTier} />
  );
}
