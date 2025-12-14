import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import type { RaidStatisticsData } from "~/routes/raids.data.$id.statistics";
import RaidStatisticsSlotCount from "./RaidStatisticsSlotCount";

type RaidStatisticsScreenProps = {
  statistics: Exclude<RaidStatisticsData["statistics"], undefined>;
  maxTier: number;
};

export default function RaidStatisticsScreen({ statistics, maxTier }: RaidStatisticsScreenProps) {
  return (
    <div className="xl:grid xl:grid-cols-2 xl:gap-4">
      <div>
        <p className="text-lg font-bold">스트라이커 편성 횟수</p>
        <SlotCountInfos statistics={statistics.filter(({ student }) => student.role === "striker")} maxTier={maxTier} />
      </div>
      <div>
        <p className="text-lg font-bold">스페셜 편성 횟수</p>
        <SlotCountInfos statistics={statistics.filter(({ student }) => student.role === "special")} maxTier={maxTier} />
      </div>
    </div>
  )
}

function SlotCountInfos({ statistics, maxTier }: { statistics: Exclude<RaidStatisticsData["statistics"], undefined>, maxTier?: number }) {
  const [showMore, setShowMore] = useState(false);
  const sortedStatistics = useMemo(() => {
    const sorted = [...statistics].sort((a, b) => (b.slotsCount + b.assistsCount) - (a.slotsCount + a.assistsCount))
    return showMore ? sorted : sorted.slice(0, 5);
  }, [statistics, showMore]);

  return (
    <>
      {sortedStatistics.map(({ student, slotsCount, slotsByTier, assistsCount, assistsByTier }) => (
        <RaidStatisticsSlotCount
          key={student.uid}
          student={student}
          slotsCount={slotsCount}
          slotsByTier={slotsByTier}
          assistsCount={assistsCount}
          assistsByTier={assistsByTier}
          maxTier={maxTier}
        />
      ))}
      {statistics.length > 5 && (
        <div
          className="py-2 mb-4 text-center cursor-pointer hover:underline flex items-center justify-center"
          onClick={() => setShowMore(!showMore)}
        >
          {showMore ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
          <span className="ml-1">{showMore ? "접기" : "더 보기"}</span>
        </div>
      )}
    </>
  );
}
