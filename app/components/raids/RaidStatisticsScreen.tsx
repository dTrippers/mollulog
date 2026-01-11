import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import type { RaidStatistics } from "~/models/raid-statistics.client";
import RaidStatisticsSlotCount from "./RaidStatisticsSlotCount";
import { Role } from "~/models/content.d";

type RaidStatisticsScreenProps = {
  statistics: RaidStatistics[];
  allStudents: Record<string, { name: string; role: Role }>;
  maxTier: number;
};

export default function RaidStatisticsScreen({ statistics, allStudents, maxTier }: RaidStatisticsScreenProps) {
  return (
    <div className="xl:grid xl:grid-cols-2 xl:gap-4">
      <div>
        <p className="text-lg font-bold">스트라이커 편성 횟수</p>
        <SlotCountInfos statistics={statistics.filter(({ studentUid }) => allStudents[studentUid]?.role === "striker")} allStudents={allStudents} maxTier={maxTier} />
      </div>
      <div>
        <p className="text-lg font-bold">스페셜 편성 횟수</p>
        <SlotCountInfos statistics={statistics.filter(({ studentUid }) => allStudents[studentUid]?.role === "special")} allStudents={allStudents} maxTier={maxTier} />
      </div>
    </div>
  )
}

function SlotCountInfos({ statistics, allStudents, maxTier }: { statistics: RaidStatistics[], allStudents: Record<string, { name: string; role: Role }>, maxTier?: number }) {
  const [showMore, setShowMore] = useState(false);
  const sortedStatistics = useMemo(() => {
    const sorted = [...statistics].sort((a, b) => (b.slotsCount + b.assistsCount) - (a.slotsCount + a.assistsCount))
    return showMore ? sorted : sorted.slice(0, 5);
  }, [statistics, showMore]);

  return (
    <>
      {sortedStatistics.map(({ studentUid, slotsCount, slotsByTier, assistsCount, assistsByTier }) => (
        <RaidStatisticsSlotCount
          key={studentUid}
          student={{ uid: studentUid, name: allStudents[studentUid].name }}
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
