import { useEffect } from "react";
import { useFetcher, useOutletContext } from "react-router";
import { LoadingSkeleton } from "~/components/atoms/layout";
import { EmptyView } from "~/components/atoms/typography";
import RaidStatisticsScreen from "~/components/raids/RaidStatisticsScreen";
import { getMaxTierAt } from "~/models/student";
import type { RaidPageContext } from "./raids.$id";
import type { RaidStatisticsData } from "./raids.data.$id.statistics";

export default function RaidStatistics() {
  const { currentRaid, defenseType } = useOutletContext<RaidPageContext>();
  const maxTier = getMaxTierAt(currentRaid.since);

  const fetcher = useFetcher<RaidStatisticsData>();
  useEffect(() => {
    fetcher.load(`/raids/data/${currentRaid.uid}/statistics?defenseType=${defenseType}`);
  }, [currentRaid.uid, defenseType]);

  if (!fetcher.data || fetcher.state !== "idle") {
    return <LoadingSkeleton />;
  } else if (fetcher.data.statistics?.length === 0) {
    return <EmptyView text="통계 정보를 준비중이에요" />;
  }

  return (
    <RaidStatisticsScreen statistics={fetcher.data.statistics!} maxTier={maxTier} />
  )
}
