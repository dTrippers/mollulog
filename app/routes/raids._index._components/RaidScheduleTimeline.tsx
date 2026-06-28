import { Link } from "react-router";
import { AttributeBadge, EmptyView, HorizontalScroll } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { raidTypeToParam } from "~/domain/raid";
import { formatInstant, isInstantAfter, isInstantBefore } from "~/lib/date-time";
import { defenseTypeColor, defenseTypeLocale, raidTypeLocale, terrainLocale } from "~/locales/ko";
import type { RaidPortalSchedule } from "~/views/raid";

type RaidScheduleTimelineProps = {
  raids: RaidPortalSchedule[];
  now: string;
};

export default function RaidScheduleTimeline({ raids, now }: RaidScheduleTimelineProps) {
  if (raids.length === 0) {
    return <EmptyView text="표시할 총력전/대결전 일정이 없어요" className="mt-4" />;
  }

  return (
    <div className="mt-4">
      <HorizontalScroll itemWidth={{ mobile: "w-64", desktop: "md:w-72" }} gap="gap-2" className="-mx-4 px-4" fadeEdges>
        {raids.map((raid) => (
          <TimelineItem key={`${raid.raidType}-${raid.seasonIndex}`} raid={raid} now={now} />
        ))}
      </HorizontalScroll>
    </div>
  );
}

function TimelineItem({ raid, now }: { raid: RaidPortalSchedule; now: string }) {
  const displayTimeZone = useDisplayTimeZone();
  const isPast = raid.endAt ? isInstantBefore(raid.endAt, now) : false;
  const isFuture = raid.startAt ? isInstantAfter(raid.startAt, now) : false;
  const status = isPast ? "종료" : isFuture ? "예정" : "진행 중";
  const primaryDefenseTypes = Array.from(
    new Set(raid.defenseTypeSets.map((defenseTypeSet) => defenseTypeSet.primaryDefenseType)),
  );

  return (
    <Link
      to={`/raids/${raidTypeToParam(raid.raidType)}/${raid.seasonIndex}`}
      className={
        isPast
          ? "block h-full opacity-60 transition-opacity hover:opacity-80"
          : "block h-full transition-opacity hover:opacity-75"
      }
    >
      <div className="flex min-h-32 flex-col justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {raidTypeLocale[raid.raidType as keyof typeof raidTypeLocale] ?? raid.raidType} #{raid.seasonIndex}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {!isPast && !isFuture && <span className="size-1.5 rounded-full bg-red-500" />}
              {status}
            </span>
          </div>
          <h3 className="mt-2 text-base font-bold">{raid.raidBoss.name}</h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{terrainLocale[raid.terrain]}</p>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap gap-1">
            {primaryDefenseTypes.map((defenseType) => (
              <AttributeBadge
                key={defenseType}
                text={defenseTypeLocale[defenseType]}
                color={defenseTypeColor[defenseType]}
              />
            ))}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {raid.startAt ? formatInstant(raid.startAt, { timeZone: displayTimeZone, format: "YYYY.MM.DD" }) : "-"} ~{" "}
            {raid.endAt ? formatInstant(raid.endAt, { timeZone: displayTimeZone, format: "MM.DD" }) : "-"}
          </p>
        </div>
      </div>
    </Link>
  );
}
