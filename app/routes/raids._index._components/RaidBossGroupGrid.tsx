import { Link } from "react-router";
import { EmptyView } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant } from "~/lib/date-time";
import { raidTypeLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import type { RaidPortalBossGroup } from "~/views/raid";

type RaidBossGroupGridProps = {
  groups: RaidPortalBossGroup[];
};

export default function RaidBossGroupGrid({ groups }: RaidBossGroupGridProps) {
  if (groups.length === 0) {
    return <EmptyView text="표시할 보스별 메타가 없어요" className="mt-4" />;
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <BossGroupCard key={`${group.bossUid}-${group.terrain}`} group={group} />
      ))}
    </div>
  );
}

function BossGroupCard({ group }: { group: RaidPortalBossGroup }) {
  const displayTimeZone = useDisplayTimeZone();
  const bossPath = `/bosses?boss=${encodeURIComponent(group.bossUid)}&terrain=${encodeURIComponent(group.terrain)}`;

  return (
    <Link
      to={bossPath}
      className="block overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
    >
      <div
        className="aspect-3/1 bg-cover bg-center"
        style={{ backgroundImage: `url(${bossImageUrl(group.bossUid)})` }}
      />
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold">{group.bossName}</h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{terrainLocale[group.terrain]}</p>
          </div>
          <span className="flex-shrink-0 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {group.count}회
          </span>
        </div>

        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          <p>
            최근 시즌:{" "}
            <span className="font-medium text-neutral-700 dark:text-neutral-300">
              {raidTypeLocale[group.latest.raidType as keyof typeof raidTypeLocale] ?? group.latest.raidType} #
              {group.latest.seasonIndex}
            </span>
          </p>
          <p className="mt-1">
            {group.latest.startAt
              ? formatInstant(group.latest.startAt, { timeZone: displayTimeZone, format: "YYYY.MM.DD" })
              : "일정 미정"}
          </p>
        </div>
      </div>
    </Link>
  );
}
