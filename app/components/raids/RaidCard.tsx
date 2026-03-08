import dayjs from "dayjs";
import { Link } from "react-router";
import type { RaidType, Terrain } from "~/models/content.d";
import type { Difficulty } from "~/models/raid";
import { bossImageUrl } from "~/models/assets";
import { defenseTypeLocale, difficultyLocale, raidTypeLocale, relativeTime, terrainLocale } from "~/locales/ko";
import { sanitizeClassName } from "~/prophandlers";
import { Defense } from "~/graphql/graphql";

type RaidCardProps = {
  raid: {
    name: string;
    boss: string;
    type: RaidType;
    raidIndexJp: number | null;
    defenseTypes: {
      defenseType: Defense;
      difficulty: Difficulty | null;
    }[];
    since: Date;
    until: Date;
    terrain: Terrain;
  };

  buttons?: {
    text: string;
    to: string;
  }[];

  timeLocaleType: "relative" | "absolute";
  showName?: boolean;
};

const defenseTypeColorClass: Record<Defense, string> = {
  light: "bg-red-500",
  heavy: "bg-yellow-500",
  special: "bg-blue-500",
  elastic: "bg-purple-500",
  composite: "bg-green-600",
  normal: "bg-gray-500",
};

export default function RaidCard({ raid, timeLocaleType, buttons, showName = true }: RaidCardProps) {
  const { name, boss, type, defenseTypes, since, until, terrain } = raid;

  const sinceDayjs = dayjs(since);
  const untilDayjs = dayjs(until);
  const now = dayjs();

  let timeLabel = null;
  if (timeLocaleType === "relative") {
    if (sinceDayjs.isAfter(now)) {
      timeLabel = `${relativeTime(sinceDayjs)} 시작`;
    } else if (untilDayjs.isAfter(now)) {
      timeLabel = `${relativeTime(untilDayjs)} 종료`;
    }
  } else {
    timeLabel = `${dayjs(since).format("YYYY/M/D")}`;
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700">
      <div className="aspect-[5/2] md:aspect-[2/1] relative">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bossImageUrl(boss)})` }}
        >
          <div className="absolute inset-0 bg-white/85 dark:bg-neutral-800/85"></div>
        </div>

        <div className="relative h-full flex flex-col justify-between">
          {timeLabel && (
            <div className="absolute top-0 left-0 py-3 px-3 md:px-4">
              <div className="flex items-center px-1.5 py-0.5 gap-x-1.5 text-xs text-center bg-neutral-100 dark:bg-neutral-800 rounded-md">
                {timeLocaleType === "relative" && sinceDayjs.isBefore(now) && <div className="size-2 bg-red-500 rounded-full animate-pulse" />}
                <p className="text-sm text-neutral-600 dark:text-neutral-300">{timeLabel}</p>
              </div>
            </div>
          )}

          {/* 하단 */}
          <div className="absolute bottom-0 left-0 right-0 py-3 px-3 md:px-4">
            <div className="flex items-end justify-between gap-4">
              {/* 좌측: 보스 이름 */}
              <div>
                <p className="md:mb-0.5 text-xs text-neutral-600 dark:text-neutral-300">
                  {raidTypeLocale[type]}{raid.raidIndexJp ? ` #${raid.raidIndexJp}` : ""} · {terrainLocale[terrain]}
                </p>
                {showName && <h3 className="text-lg md:text-xl font-bold">{name}</h3>}
                {buttons && buttons.length > 0 && (
                  <div className="mt-1 flex gap-1">
                    {buttons.map(({ text, to }, index) => (
                      <Link
                        key={index} to={to}
                        className={sanitizeClassName(`
                          px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-black
                          border border-neutral-200 dark:border-neutral-700 rounded-md transition whitespace-nowrap
                        `)}>
                        {text}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* 데스크탑: 우측 난이도/방어타입 */}
              <div className="flex flex-col gap-1 items-start flex-shrink-0">
                {defenseTypes.map(({ defenseType, difficulty }, index) => (
                  <div key={index} className="flex items-center gap-1.5 flex-nowrap">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      {difficulty ? difficultyLocale[difficulty] : "방어 타입"}
                    </span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold text-white whitespace-nowrap flex-shrink-0 ${defenseTypeColorClass[defenseType]}`}>
                      {defenseTypeLocale[defenseType]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
