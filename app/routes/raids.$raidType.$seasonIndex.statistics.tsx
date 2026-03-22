import { useEffect, useState } from "react";
import { type LoaderFunctionArgs, useLoaderData, useOutletContext } from "react-router";
import { EmptyView, LoadingSkeleton } from "~/components/primitives";
import RaidStatisticsScreen from "~/components/features/raids/RaidStatisticsScreen";
import { getMaxTierAt } from "~/models/student";
import { getAllStudentsMap } from "~/models/student";
import { fetchRaidStatisticsByRaid, type RaidStatistics as RaidStatisticsData } from "~/models/raid-statistics.client";
import type { RaidPageContext } from "./raids.$raidType.$seasonIndex";
import type { RaidType } from "~/models/content.d";
import RaidUnavailableState from "./raids.$raidType.$seasonIndex._components/RaidUnavailableState";

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

export default function RaidStatisticsPage() {
  const { currentRaid, defenseType } = useOutletContext<RaidPageContext>();
  const { allStudents } = useLoaderData<typeof loader>();
  const maxTier = currentRaid.startAt ? getMaxTierAt(currentRaid.startAt) : null;

  const jpSeasonIndex = currentRaid.jpSchedule?.seasonIndex ?? null;

  const [statistics, setStatistics] = useState<RaidStatisticsData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jpSeasonIndex === null) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadStatistics = async () => {
      try {
        setLoading(true);
        setError(null);

        const rawStatistics = await fetchRaidStatisticsByRaid(currentRaid.raidType as RaidType, jpSeasonIndex, defenseType);
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
  }, [currentRaid.raidType, jpSeasonIndex, defenseType]);

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
    <RaidStatisticsScreen statistics={statistics} allStudents={allStudents} maxTier={maxTier ?? 8} />
  );
}
