import { ArrowRightIcon } from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import { OptionBadge } from "~/components/primitives";
import { defenseTypeColor, difficultyLocale, raidTypeLocale } from "~/locales/ko";

type RaidComparisonHeaderProps = {
  fromRaid: {
    since: Date;
    until: Date;
    type: keyof typeof raidTypeLocale;
  };
  toRaid: {
    since: Date;
    until: Date;
    type: keyof typeof raidTypeLocale;
  };
  defenseType: keyof typeof defenseTypeColor;
  fromDifficulty: keyof typeof difficultyLocale | null;
  currentDifficulty: keyof typeof difficultyLocale | null;
};

export default function RaidComparisonHeader({ fromRaid, toRaid, defenseType, fromDifficulty, currentDifficulty }: RaidComparisonHeaderProps) {
  return (
    <div className="flex items-center gap-2 md:gap-4 mb-6">
      <div className="flex-1 bg-white dark:bg-neutral-900 rounded-lg p-3 md:p-4 border border-neutral-200 dark:border-neutral-700">
        <div className="text-sm md:text-base font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
          과거 개최
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
          {dayjs(fromRaid.since).format("YYYY/M/D")} ~ {dayjs(fromRaid.until).format("M/D")}
        </div>
        {fromDifficulty && (
          <div className="flex mt-2 gap-x-1">
            <OptionBadge text={raidTypeLocale[fromRaid.type]} />
            <OptionBadge text={difficultyLocale[fromDifficulty]} color={defenseTypeColor[defenseType]} />
          </div>
        )}
      </div>

      <ArrowRightIcon className="size-4 text-neutral-600 dark:text-neutral-300 shrink-0" strokeWidth={2} />

      <div className="flex-1 bg-white dark:bg-neutral-900 rounded-lg p-3 md:p-4 border border-neutral-200 dark:border-neutral-700">
        <div className="text-sm md:text-base font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
          현재 개최
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
          {dayjs(toRaid.since).format("YYYY/M/D")} ~ {dayjs(toRaid.until).format("M/D")}
        </div>
        {currentDifficulty && (
          <div className="flex mt-2 gap-x-1">
            <OptionBadge text={raidTypeLocale[toRaid.type]} />
            <OptionBadge text={difficultyLocale[currentDifficulty]} color={defenseTypeColor[defenseType]} />
          </div>
        )}
      </div>
    </div>
  );
}
