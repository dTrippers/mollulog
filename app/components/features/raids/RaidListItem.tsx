import { Link } from "react-router";
import { AttributeBadge } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import type { Defense } from "~/graphql/graphql";
import { type UtcIsoString, formatInstant } from "~/lib/date-time";
import { defenseTypeColor, defenseTypeLocale, difficultyLocale, raidTypeLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import type { RaidType, Terrain } from "~/models/content.d";
import type { Difficulty } from "~/models/raid";
import { sanitizeClassName } from "~/prophandlers";

export type RaidListItemRaid = {
  raidBoss: { uid: string; name: string };
  raidType: string;
  seasonIndex?: number;
  startAt: UtcIsoString | Date | null;
  endAt: UtcIsoString | Date | null;
  terrain: Terrain;
  defenseTypes: {
    defenseType: Defense;
    difficulty: Difficulty | string | null;
  }[];
};

type RaidListItemAction = {
  text: string;
  to: string;
};

type RaidListItemProps = {
  raid: RaidListItemRaid;
  actions?: RaidListItemAction[];
  reserveRightAccessorySpace?: boolean;
  className?: string;
};

export default function RaidListItem({
  raid,
  actions,
  reserveRightAccessorySpace = false,
  className,
}: RaidListItemProps) {
  const displayTimeZone = useDisplayTimeZone();
  const { raidBoss, raidType, seasonIndex, defenseTypes, startAt, endAt, terrain } = raid;

  return (
    <div
      className={sanitizeClassName(`
        relative overflow-hidden rounded-lg bg-white transition-colors hover:bg-neutral-100
        dark:bg-neutral-900 dark:hover:bg-neutral-800
        ${className ?? ""}
      `)}
    >
      <img
        src={bossImageUrl(raidBoss.uid)}
        alt="보스 이미지"
        className="absolute top-0 right-0 h-full object-cover opacity-70"
        loading="lazy"
      />
      <div
        className={sanitizeClassName(`
          relative w-full rounded-lg bg-white/90 p-4 transition-colors dark:bg-neutral-900/80
          ${reserveRightAccessorySpace ? "pr-10" : ""}
        `)}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {raidTypeLocale[raidType as RaidType] ?? raidType}
              {seasonIndex != null ? ` #${seasonIndex}` : ""} · {terrainLocale[terrain]}
            </p>
            <p className="truncate text-sm font-bold lg:text-base">{raidBoss.name}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {startAt ? formatInstant(startAt, { timeZone: displayTimeZone, format: "YYYY.MM.DD" }) : "-"} ~{" "}
              {endAt ? formatInstant(endAt, { timeZone: displayTimeZone, format: "MM.DD" }) : "-"}
            </p>
            {actions && actions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {actions.map(({ text, to }) => (
                  <Link
                    key={`${text}-${to}`}
                    to={to}
                    className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-black"
                  >
                    {text}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1">
            {defenseTypes.map(({ defenseType, difficulty }) => (
              <div key={`${defenseType}-${difficulty ?? "none"}`} className="flex items-center gap-1.5">
                {difficulty && (
                  <span className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                    {difficultyLocale[difficulty] ?? difficulty}
                  </span>
                )}
                <AttributeBadge text={defenseTypeLocale[defenseType]} color={defenseTypeColor[defenseType]} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
