import { useEffect } from "react";
import { useFetcher } from "react-router";
import { IdentificationIcon, MinusCircleIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import type { RaidRanksData } from "~/routes/raids.data.$id.ranks";
import { LoadingSkeleton } from "~/components/atoms/layout";
import { EmptyView } from "~/components/atoms/typography";
import { ActionCard } from "~/components/molecules/editor";
import { StudentCards } from "~/components/molecules/student";
import { RaidRankFilterState } from "./RaidRankFilter";
import { Button } from "../atoms/form";

type RaidRankScreenProps = {
  currentRaid: {
    uid: string;
    since: Date;
  };
  filterState: RaidRankFilterState;

  onIncludeStudent: (student: { uid: string; tier: number }) => void;
  onExcludeStudent: (student: { uid: string; tier: number }) => void;
  onNext: (cursor: number) => void;
  onPrev: (cursor: number) => void;
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

export default function RaidRankScreen({ currentRaid, filterState, onIncludeStudent, onExcludeStudent, onNext, onPrev }: RaidRankScreenProps) {
  const fetcher = useFetcher<RaidRanksData>();
  useEffect(() => {
    fetcher.submit(JSON.stringify(filterState), {
      method: "POST",
      action: `/raids/data/${currentRaid.uid}/ranks`,
      encType: "application/json",
    });
  }, [currentRaid.uid, filterState]);

  if (!fetcher.data || fetcher.state !== "idle") {
    return <LoadingSkeleton />;
  }
  if (fetcher.data?.ranks.length === 0) {
    return <EmptyView text="조건에 맞는 순위 정보가 없어요." />;
  }

  const showPrev = filterState.rankAfter !== null || (filterState.rankBefore !== null && (fetcher.data?.ranks[0]?.rank ?? 0) > 1 && fetcher.data?.hasMore);
  const showNext = filterState.rankBefore !== null || fetcher.data?.hasMore;

  const maxLevel = getMaxLevelAt(currentRaid.since);
  return (
    <div>
      {fetcher.data?.ranks.map(({ rank, score, parties, video }) => (
        <ActionCard
          key={`rank-${rank}`}
          actions={video ? [{
            text: "공략 영상",
            color: "red",
            link: `https://www.youtube.com/watch?v=${video.youtubeId}`,
          }] : []}
        >
          <p className="text-lg mb-4">
            <span className="font-bold">{rank}위</span> ({score.toLocaleString()}점)
          </p>
          {parties.map((party) => (
            <StudentCards
              key={`party-${party.partyIndex}`}
              students={party.slots.map(({ student, tier, level, isAssist }) => ({
                uid: student?.uid ?? null,
                name: student?.name,
                attackType: student?.attackType,
                defenseType: student?.defenseType,
                role: student?.role,
                tier,
                level: level && level < maxLevel ? level : undefined,
                isAssist,
                popups: student && tier ? [
                  {
                    Icon: IdentificationIcon,
                    text: "학생부 보기 (평가/통계)",
                    link: `/students/${student.uid}`,
                  },
                  {
                    Icon: PlusCircleIcon,
                    text: "이 학생을 포함한 편성만 보기",
                    onClick: () => onIncludeStudent({ uid: student.uid, tier }),
                  },
                  {
                    Icon: MinusCircleIcon,
                    text: "이 학생을 제외한 편성만 보기",
                    onClick: () => onExcludeStudent({ uid: student.uid, tier }),
                  },
                ] : undefined,
                popupId: student ? `${rank}-${party.partyIndex}-${student.uid}` : undefined,
              }))}
              pcGrid={10}
            />
          ))}
        </ActionCard>
      ))}

      <div className="flex justify-center">
        {showPrev && (
          <Button onClick={() => onPrev(fetcher.data?.ranks[0]?.rank ?? 0)}>
            &lt; 이전
          </Button>
        )}
        {showNext && (
          <Button onClick={() => onNext(fetcher.data?.ranks[fetcher.data?.ranks.length - 1]?.rank ?? 0)}>
            다음 &gt;
          </Button>
        )}
      </div>
    </div>
  );
}
