import { useState } from "react";
import { Link } from "react-router";
import { ActionCard } from "~/components/features/editor";
import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { StudentCard, TierCounts } from "~/components/features/students";
import { FilterButtons, OptionBadge } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant, type UtcIsoString } from "~/lib/date-time";
import { defenseTypeLocale, difficultyLocale, terrainLocale } from "~/locales/ko";
import { defenseTypeColor } from "~/locales/ko";
import { raidTypeLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import type { RaidType, Terrain } from "~/models/content.d";
import type { Defense } from "~/graphql/graphql";
import { raidTypeToParam } from "~/models/raid";

type RaidStatisticsSlotCountProps = {
  student?: { uid: string; name: string };
  raid?: {
    raidType: RaidType;
    seasonIndex: number;
    name: string;
    boss: string;
    defenseType: Defense;
    difficulty: string | null;
    startAt: UtcIsoString;
    endAt: UtcIsoString;
    terrain: Terrain;
  };
  slotsCount: number;
  slotsByTier: { tier: number; count: number }[];
  assistsCount: number;
  assistsByTier: { tier: number; count: number }[];

  maxTier?: number;
}

type SlotMode = "total" | "own" | "assist";

export default function RaidStatisticsSlotCount({ student, raid, slotsCount, assistsCount, slotsByTier, assistsByTier, maxTier = 8 }: RaidStatisticsSlotCountProps) {
  const displayTimeZone = useDisplayTimeZone();
  const ownedByTierMap = slotsByTier.reduce((acc, { tier, count }) => {
    acc[tier] = count;
    return acc;
  }, {} as { [tier: number]: number });

  const assistsByTierMap = assistsByTier.reduce((acc, { tier, count }) => {
    acc[tier] = count;
    return acc;
  }, {} as { [tier: number]: number });

  // Sum the two tier maps for total slot mode
  const totalByTierMap = { ...ownedByTierMap };
  for (const [tier, count] of Object.entries(assistsByTierMap)) {
    const tierNum = Number.parseInt(tier);
    totalByTierMap[tierNum] = (totalByTierMap[tierNum] || 0) + count;
  }

  const [slotMode, setSlotMode] = useState<SlotMode>("total");
  const tierCounts = {
    total: totalByTierMap,
    own: ownedByTierMap,
    assist: assistsByTierMap,
  };

  return (
    <ActionCard actions={[]}>
      {raid && (
        <div className="mb-4 -mt-4 md:-mt-6 -mr-4 md:-mr-6 py-4 relative flex">
          <Link
            to={`/raids/${raidTypeToParam(raid.raidType)}/${raid.seasonIndex}`}
            className="grow group z-10 relative "
          >
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {raidTypeLocale[raid.raidType]}
            </p>
            <p className="text-lg font-bold group-hover:underline">
              {raid.name}
              <ChevronRightIcon className="size-4 inline-block" />
            </p>
            <p className="text-xs">
              {formatInstant(raid.startAt, { timeZone: displayTimeZone, format: "YYYY-MM-DD" })}
              <span className="hidden md:inline">
                {" "}
                ~ {formatInstant(raid.endAt, { timeZone: displayTimeZone, format: "YYYY-MM-DD" })}
              </span>
            </p>
          </Link>
          <div
            className="absolute top-0 right-0 w-3/5 md:w-1/2 h-full rounded-tr-lg bg-cover"
            style={{ backgroundImage: `url(${bossImageUrl(raid.boss)})` }}
          />
          <div className="absolute right-2 bottom-1 z-10 flex gap-1">
            {raid.difficulty && <OptionBadge text={difficultyLocale[raid.difficulty]} bgColor="dark" />}
            <OptionBadge text={terrainLocale[raid.terrain]} bgColor="dark" />
            <OptionBadge text={defenseTypeLocale[raid.defenseType]} color={defenseTypeColor[raid.defenseType]} bgColor="dark" />
          </div>
        </div>
      )}

      {student && (
        <Link to={`/students/${student.uid}`} className="hover:underline">
          <div className="-mt-1 md:-mt-2 mb-2 flex items-center gap-2">
            <div className="w-10 shrink-0">
              <StudentCard uid={student.uid} circular />
            </div>
            <p className="font-bold text-base">
              <span>{student.name}</span>
              <ChevronRightIcon className="inline size-4" />
            </p>
          </div>
        </Link>
      )}
        <div className="flex-grow min-w-0">
          <FilterButtons
            buttonProps={[
              { text: "전체", subText: `${slotsCount + assistsCount}`, active: slotMode === "total", onToggle: () => setSlotMode("total") },
              { text: "모집", subText: `${slotsCount}`, active: slotMode === "own", onToggle: () => setSlotMode("own") },
              { text: "조력", subText: `${assistsCount}`, active: slotMode === "assist", onToggle: () => setSlotMode("assist") },
            ]}
            exclusive
            size="sm"
          />
          <div className="overflow-x-auto">
            <TierCounts
              tierCounts={tierCounts[slotMode]}
              // From maxTier to 3
              visibleTiers={Array.from({ length: maxTier - 2 }, (_, i) => maxTier - i)}
              reducePaddings
              totalCount={20000}
            />
          </div>
        </div>
    </ActionCard>
  );
}
