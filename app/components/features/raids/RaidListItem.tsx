import { Link } from "react-router";
import { AttributeBadge } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import type { Defense } from "~/graphql/graphql";
import { type UtcIsoString, formatInstant } from "~/lib/date-time";
import { defenseTypeColor, defenseTypeLocale, difficultyLocale, raidTypeLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import type { RaidType, Terrain } from "~/models/content.d";
import type { Difficulty } from "~/domain/raid-score";
import { cn } from "~/lib/utils";

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
  defenseTypeSets?: {
    difficulty: Difficulty | string | null;
    defenseTypes: Defense[];
    primaryDefenseType?: Defense;
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
  const { raidBoss, raidType, seasonIndex, startAt, endAt, terrain } = raid;
  const displayDefenseTypeSets = getDisplayDefenseTypeSets(raid);

  return (
    <div
      className={cn(`
        relative overflow-hidden rounded-lg bg-card transition-colors hover:bg-muted
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
        className={cn(`
          relative w-full rounded-lg bg-card/90 p-4 transition-colors
          ${reserveRightAccessorySpace ? "pr-10" : ""}
        `)}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {raidTypeLocale[raidType as RaidType] ?? raidType}
              {seasonIndex != null ? ` #${seasonIndex}` : ""} · {terrainLocale[terrain]}
            </p>
            <p className="truncate text-sm font-bold lg:text-base">{raidBoss.name}</p>
            <p className="text-xs text-muted-foreground">
              {startAt ? formatInstant(startAt, { timeZone: displayTimeZone, format: "YYYY.MM.DD" }) : "-"} ~{" "}
              {endAt ? formatInstant(endAt, { timeZone: displayTimeZone, format: "MM.DD" }) : "-"}
            </p>
            {actions && actions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {actions.map(({ text, to }) => (
                  <Link
                    key={`${text}-${to}`}
                    to={to}
                    className="rounded-md bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {text}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1">
            {displayDefenseTypeSets.map(({ defenseTypes: setDefenseTypes, difficulty }) => (
              <div key={`${difficulty ?? "none"}-${setDefenseTypes.join("-")}`} className="flex items-center gap-1.5">
                {difficulty && (
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {difficultyLocale[difficulty] ?? difficulty}
                  </span>
                )}
                <div className="flex flex-wrap items-center justify-end gap-1">
                  {setDefenseTypes.map((defenseType) => (
                    <AttributeBadge
                      key={defenseType}
                      text={defenseTypeLocale[defenseType]}
                      color={defenseTypeColor[defenseType]}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getDisplayDefenseTypeSets(raid: RaidListItemRaid) {
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
