import { Fragment } from "react";
import { Link } from "react-router";
import { AttributeBadge } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import type { Attack, Defense } from "~/graphql/graphql";
import {
  type UtcIsoString,
  formatInstant,
  isInstantAfter,
  isInstantBefore,
  nowUtcIso,
  parseUtcTimestamp,
} from "~/lib/date-time";
import {
  attackTypeColor,
  attackTypeLocale,
  defenseTypeColor,
  defenseTypeLocale,
  difficultyLocale,
  raidTypeLocale,
  relativeTime,
  terrainLocale,
} from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import type { RaidType, Terrain } from "~/models/content.d";
import type { Difficulty } from "~/domain/raid-score";
import { sanitizeClassName } from "~/prophandlers";

type RaidCardProps = {
  raid: {
    raidBoss: { uid: string; name: string };
    raidType: string;
    seasonIndex?: number;
    defenseTypes: {
      defenseType: Defense;
      difficulty: Difficulty | string | null;
    }[];
    defenseTypeSets?: {
      difficulty: Difficulty | string | null;
      defenseTypes: Defense[];
      primaryDefenseType?: Defense;
    }[];
    startAt: UtcIsoString | null;
    endAt: UtcIsoString | null;
    terrain: Terrain;
    attackType?: Attack | null;
  };

  buttons?: {
    text: string;
    to: string;
  }[];

  timeLocaleType: "relative" | "absolute";
  showName?: boolean;
  showTimeLabel?: boolean;
  showTitle?: boolean;
  showDateRange?: boolean;
  showDifficulty?: boolean;
  showAttackType?: boolean;
  reserveRightAccessorySpace?: boolean;
  className?: string;
};

export default function RaidCard({
  raid,
  timeLocaleType,
  buttons,
  showName = true,
  showTimeLabel = true,
  showTitle = true,
  showDateRange = false,
  showDifficulty = true,
  showAttackType = false,
  reserveRightAccessorySpace = false,
  className,
}: RaidCardProps) {
  const { raidBoss, raidType, seasonIndex, startAt, endAt, terrain, attackType } = raid;
  const displayDefenseTypeSets = getDisplayDefenseTypeSets(raid);
  const displayTimeZone = useDisplayTimeZone();

  const now = nowUtcIso();

  let timeLabel = null;
  if (timeLocaleType === "relative") {
    if (startAt && isInstantAfter(startAt, now)) {
      timeLabel = `${relativeTime(parseUtcTimestamp(startAt), { timeZone: displayTimeZone })} 시작`;
    } else if (endAt && isInstantAfter(endAt, now)) {
      timeLabel = `${relativeTime(parseUtcTimestamp(endAt), { timeZone: displayTimeZone })} 종료`;
    }
  } else if (startAt) {
    timeLabel = `${formatInstant(startAt, { timeZone: displayTimeZone, format: "YYYY/M/D" })}`;
  }

  const hasVisibleDifficulty = showDifficulty && displayDefenseTypeSets.some(({ difficulty }) => difficulty);

  return (
    <div
      className={sanitizeClassName(
        `relative overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 ${className ?? ""}`,
      )}
    >
      <div className="relative aspect-3/1">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bossImageUrl(raidBoss.uid)})` }}
        />
        <div className="absolute inset-0 bg-white/75 dark:bg-neutral-800/75" />

        <div className="relative h-full flex flex-col justify-between">
          {showTimeLabel && timeLabel && (
            <div className="absolute top-0 left-0 px-3 py-2">
              <div className="flex items-center px-1.5 py-0.5 gap-x-1.5 text-xs text-center bg-neutral-100 dark:bg-neutral-800 rounded-md">
                {timeLocaleType === "relative" && startAt && isInstantBefore(startAt, now) && (
                  <div className="size-2 bg-red-500 rounded-full animate-pulse" />
                )}
                <p className="text-xs text-neutral-600 md:text-sm dark:text-neutral-300">{timeLabel}</p>
              </div>
            </div>
          )}

          {/* 하단 */}
          <div
            className={sanitizeClassName(
              reserveRightAccessorySpace
                ? "absolute bottom-0 left-0 right-0 py-2 pl-3 pr-8"
                : "absolute bottom-0 left-0 right-0 px-3 py-2",
            )}
          >
            <div className={sanitizeClassName(`flex items-end gap-4 ${showTitle ? "justify-between" : "justify-end"}`)}>
              {/* 좌측: 보스 이름 */}
              {showTitle ? (
                <div>
                  <p className="md:mb-0.5 text-xs text-neutral-600 dark:text-neutral-300">
                    {raidTypeLocale[raidType as RaidType] ?? raidType}
                    {seasonIndex != null ? ` #${seasonIndex}` : ""} · {terrainLocale[terrain]}
                  </p>
                  {showName && <h3 className="text-base font-bold">{raidBoss.name}</h3>}
                  {showDateRange && (
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {startAt ? formatInstant(startAt, { timeZone: displayTimeZone, format: "YYYY.MM.DD" }) : "-"} ~{" "}
                      {endAt ? formatInstant(endAt, { timeZone: displayTimeZone, format: "MM.DD" }) : "-"}
                    </p>
                  )}
                  {buttons && buttons.length > 0 && (
                    <div className="mt-1 flex gap-1">
                      {buttons.map(({ text, to }) => (
                        <Link
                          key={`${text}-${to}`}
                          to={to}
                          className={sanitizeClassName(`
                            px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-black
                            border border-neutral-200 dark:border-neutral-700 rounded-md transition whitespace-nowrap
                          `)}
                        >
                          {text}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* 데스크탑: 우측 난이도/방어타입 */}
              <div
                className={sanitizeClassName(
                  showTitle ? "flex flex-col gap-1 items-start flex-shrink-0" : "flex items-end gap-1.5 flex-shrink-0",
                )}
              >
                {showAttackType && showTitle && (
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <span className="flex-shrink-0 rounded-l-sm rounded-r-md bg-neutral-200 px-1.5 py-0.5 text-xs leading-none text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                      {terrainLocale[terrain]}
                    </span>
                    {attackType && (
                      <AttributeBadge text={attackTypeLocale[attackType]} color={attackTypeColor[attackType]} />
                    )}
                  </div>
                )}
                {showAttackType && !showTitle && (
                  <div className="flex items-center gap-1.5 flex-nowrap">
                    <span className="flex-shrink-0 rounded-l-sm rounded-r-md bg-neutral-200 px-1.5 py-0.5 text-xs leading-none text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                      {terrainLocale[terrain]}
                    </span>
                    {attackType && (
                      <AttributeBadge text={attackTypeLocale[attackType]} color={attackTypeColor[attackType]} />
                    )}
                  </div>
                )}
                {hasVisibleDifficulty ? (
                  <div className="grid grid-cols-[max-content_max-content] items-center gap-x-1.5 gap-y-1 flex-shrink-0">
                    {displayDefenseTypeSets.map(({ defenseTypes: setDefenseTypes, difficulty }) => (
                      <Fragment key={`${difficulty ?? "none"}-${setDefenseTypes.join("-")}`}>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {setDefenseTypes.map((defenseType) => (
                            <AttributeBadge
                              key={defenseType}
                              text={defenseTypeLocale[defenseType]}
                              color={defenseTypeColor[defenseType]}
                            />
                          ))}
                        </div>
                        {difficulty ? (
                          <span className="text-right text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                            {difficultyLocale[difficulty as Difficulty] ?? difficulty}
                          </span>
                        ) : (
                          <span aria-hidden="true" />
                        )}
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {displayDefenseTypeSets.map(({ defenseTypes: setDefenseTypes, primaryDefenseType }) =>
                      setDefenseTypes.map((defenseType) => (
                        <AttributeBadge
                          key={`${primaryDefenseType}-${defenseType}`}
                          text={defenseTypeLocale[defenseType]}
                          color={defenseTypeColor[defenseType]}
                        />
                      )),
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getDisplayDefenseTypeSets(raid: RaidCardProps["raid"]) {
  if (raid.defenseTypeSets && raid.defenseTypeSets.length > 0) {
    return raid.defenseTypeSets.flatMap(({ difficulty, defenseTypes, primaryDefenseType }) => {
      const fallbackPrimaryDefenseType = primaryDefenseType ?? defenseTypes[0];
      if (!fallbackPrimaryDefenseType) {
        return [];
      }
      return [
        {
          difficulty,
          defenseTypes,
          primaryDefenseType: fallbackPrimaryDefenseType,
        },
      ];
    });
  }

  return raid.defenseTypes.map(({ defenseType, difficulty }) => ({
    difficulty,
    defenseTypes: [defenseType],
    primaryDefenseType: defenseType,
  }));
}
