import { ArrowRightIcon } from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import { AttributeBadge } from "~/components/primitives";
import { defenseTypeColor, difficultyLocale, raidTypeLocale } from "~/locales/ko";

type RaidComparisonHeaderProps = {
  fromRaid: {
    startAt: string | Date | null;
    endAt: string | Date | null;
    raidType: keyof typeof raidTypeLocale;
  };
  toRaid: {
    startAt: string | Date | null;
    endAt: string | Date | null;
    raidType: keyof typeof raidTypeLocale;
  };
  defenseType: keyof typeof defenseTypeColor;
  defenseTypeLabel: string;
  fromDifficulty: keyof typeof difficultyLocale | null;
  currentDifficulty: keyof typeof difficultyLocale | null;
};

export default function RaidComparisonHeader({
  fromRaid,
  toRaid,
  defenseType,
  defenseTypeLabel,
  fromDifficulty,
  currentDifficulty,
}: RaidComparisonHeaderProps) {
  return (
    <div className="flex items-center gap-2 md:gap-4 mb-6">
      <div className="flex-1 bg-white dark:bg-neutral-900 rounded-lg p-3 md:p-4 border border-neutral-200 dark:border-neutral-700">
        <div className="text-sm md:text-base font-semibold text-neutral-700 dark:text-neutral-300 mb-1">과거 개최</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
          {dayjs(fromRaid.startAt).format("YYYY/M/D")} ~ {dayjs(fromRaid.endAt).format("M/D")}
        </div>
        {fromDifficulty && (
          <div className="flex mt-2 gap-x-1">
            <AttributeBadge text={raidTypeLocale[fromRaid.raidType]} />
            <AttributeBadge text={difficultyLocale[fromDifficulty]} color={defenseTypeColor[defenseType]} />
            <AttributeBadge text={defenseTypeLabel} color={defenseTypeColor[defenseType]} />
          </div>
        )}
      </div>

      <ArrowRightIcon className="size-4 text-neutral-600 dark:text-neutral-300 shrink-0" strokeWidth={2} />

      <div className="flex-1 bg-white dark:bg-neutral-900 rounded-lg p-3 md:p-4 border border-neutral-200 dark:border-neutral-700">
        <div className="text-sm md:text-base font-semibold text-neutral-700 dark:text-neutral-300 mb-1">현재 개최</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
          {dayjs(toRaid.startAt).format("YYYY/M/D")} ~ {dayjs(toRaid.endAt).format("M/D")}
        </div>
        {currentDifficulty && (
          <div className="flex mt-2 gap-x-1">
            <AttributeBadge text={raidTypeLocale[toRaid.raidType]} />
            <AttributeBadge text={difficultyLocale[currentDifficulty]} color={defenseTypeColor[defenseType]} />
            <AttributeBadge text={defenseTypeLabel} color={defenseTypeColor[defenseType]} />
          </div>
        )}
      </div>
    </div>
  );
}
