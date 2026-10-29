import { PhotoIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Link } from "react-router";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { raidTypeToParam } from "~/domain/raid";
import type { Defense } from "~/graphql/graphql";
import { formatInstant, type UtcIsoString } from "~/lib/date-time";
import { defenseTypeLocale, difficultyLocale, raidTypeLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import { useImageFailure } from "~/components/v2/primitives/use-image-failure";
import type { RaidType, Terrain } from "~/models/content.d";
import { getMaxTierAt } from "~/models/student-tier";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { SortControl } from "~/components/v2/primitives/SortControl";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { cn } from "~/lib/utils";
import { formatTierKey, TIER_COLORS } from "./raidTierVisual";

export type StudentRaidRecord = {
  slotsCount: number;
  slotsByTier: { tier: number; count: number }[];
  assistsCount: number;
  assistsByTier: { tier: number; count: number }[];
  raid: {
    raidType: RaidType;
    seasonIndex: number;
    name: string;
    boss: string;
    startAt: UtcIsoString;
    endAt: UtcIsoString;
    terrain: Terrain;
    defenseType: Defense;
    difficulty: string | null;
  };
};

type RecordMode = "all" | "own" | "assist";

export function formatRaidRecordDateRange(startAt: UtcIsoString, endAt: UtcIsoString, timeZone: string): string {
  const startDate = formatInstant(startAt, { timeZone, format: "YYYY/MM/DD" });
  const endDate = formatInstant(endAt, { timeZone, format: "YYYY/MM/DD" });
  return startDate.slice(0, 4) === endDate.slice(0, 4)
    ? `${startDate} ~ ${endDate.slice(5)}`
    : `${startDate} ~ ${endDate}`;
}

export function StudentRaidRecordList({
  records,
  showMore,
  sortDirection,
  onSortDirectionChange,
  onShowMoreChange,
}: {
  records: StudentRaidRecord[];
  showMore: boolean;
  sortDirection: "recent" | "old";
  onSortDirectionChange: (direction: "recent" | "old") => void;
  onShowMoreChange: (showMore: boolean) => void;
}) {
  const timeZone = useDisplayTimeZone();
  const visible = showMore ? records : records.slice(0, 5);
  const detailHref = (record: StudentRaidRecord) => {
    const path = `/raids/${raidTypeToParam(record.raid.raidType)}/${record.raid.seasonIndex}`;
    return record.raid.raidType === "elimination" ? `${path}?${new URLSearchParams({ defenseType: record.raid.defenseType })}` : path;
  };

  return (
    <section className="mt-6" aria-labelledby="student-raid-records-title">
      <div className="mb-2 flex min-h-7 items-center justify-between gap-2">
        <h2 id="student-raid-records-title" className="text-base leading-[1.4] font-semibold text-v2-fg">총력전/대결전 상세 기록</h2>
        <SortControl mode="direction" direction={sortDirection} onDirectionChange={onSortDirectionChange} />
      </div>
      {records.length === 0 ? (
        <p className="rounded-lg bg-v2-surface p-v2-block-p text-sm leading-[1.43] text-v2-fg-secondary">100회를 초과해 편성된 총력전/대결전 정보가 없어요</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 md:gap-3">
          {visible.map((record) => (
            <RaidRecordCard key={`${record.raid.raidType}-${record.raid.seasonIndex}-${record.raid.defenseType}`} record={record} timeZone={timeZone} detailHref={detailHref(record)} />
          ))}
        </div>
      )}
      {records.length > 5 ? (
        <button type="button" className="mt-2 inline-flex min-h-7 items-center rounded-md px-2 text-xs leading-[1.43] text-v2-fg-secondary hover:bg-v2-hover" onClick={() => onShowMoreChange(!showMore)}>
          {showMore ? "접기" : "더 보기"}
        </button>
      ) : null}
    </section>
  );
}

function RaidRecordCard({ record, timeZone, detailHref }: { record: StudentRaidRecord; timeZone: string; detailHref: string }) {
  const [mode, setMode] = useState<RecordMode>("all");
  const { raid } = record;
  const recordEyebrow = [raidTypeLocale[raid.raidType], raid.difficulty ? difficultyLocale[raid.difficulty] : null].filter(Boolean).join(" · ");
  const recordMetadata = [
    formatRaidRecordDateRange(raid.startAt, raid.endAt, timeZone),
    terrainLocale[raid.terrain],
    defenseTypeLocale[raid.defenseType],
  ].join(" · ");
  const totalCount = record.slotsCount + record.assistsCount;
  const tierCounts = new Map<number, number>();
  const selectedRows = mode === "assist" ? record.assistsByTier : mode === "own" ? record.slotsByTier : [...record.slotsByTier, ...record.assistsByTier];
  for (const { tier, count } of selectedRows) tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + count);
  const maxTier = Math.max(3, getMaxTierAt(raid.startAt), ...tierCounts.keys());
  const counts = {
    all: totalCount,
    own: record.slotsCount,
    assist: record.assistsCount,
  };
  const href = detailHref + (raid.raidType === "elimination" && !detailHref.includes("?") ? `?${new URLSearchParams({ defenseType: raid.defenseType })}` : "");
  const maxCount = Math.max(...tierCounts.values(), 1);

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg bg-v2-surface p-v2-block-p">
      <div className="flex min-w-0 items-center gap-3">
        <RaidBossThumb boss={raid.boss} />
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-[1.43] text-v2-fg-secondary">{recordEyebrow}</p>
          <Link to={href} {...getV2LinkTransitionProps("crossfade")} className="block truncate text-base leading-[1.4] font-semibold text-v2-fg hover:underline">
            {raid.name}
          </Link>
          <p className="text-xs leading-[1.43] text-v2-fg-tertiary tabular-nums">{recordMetadata}</p>
        </div>
      </div>
      <fieldset className="min-w-0 border-0 p-0">
        <legend className="sr-only">집계 대상</legend>
        <div className="inline-flex max-w-full gap-0.5 rounded-md bg-v2-inset p-0.5">
          {(["all", "own", "assist"] as const).map((item) => {
            const label = item === "all" ? "전체" : item === "own" ? "모집" : "조력";
            return (
              <button
                key={item}
                type="button"
                aria-pressed={mode === item}
                onClick={() => setMode(item)}
                className={cn(
                  "inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-[5px] px-2 text-xs whitespace-nowrap",
                  mode === item ? "bg-v2-selected text-v2-on-selected" : "text-v2-fg-secondary hover:bg-v2-filled-hover",
                  v2FocusRing,
                )}
              >
                {label}
                <span className={cn("tabular-nums", mode !== item && "text-v2-fg-tertiary")}>{counts[item].toLocaleString()}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <dl className="space-y-1.5 text-xs leading-[1.43]">
        {Array.from({ length: maxTier - 2 }, (_, index) => maxTier - index).map((tier) => (
          <div key={tier} className="grid grid-cols-[2.25rem_minmax(0,1fr)_3.75rem] items-center gap-x-2">
            <dt className="inline-flex items-center gap-1 text-v2-fg">
              {tier > 5 ? <span role="img" aria-label={`고유 ${tier - 5}`} className="inline-flex items-center gap-1"><img src="/icons/exclusive_weapon.png" alt="" className="size-3.5" /><span aria-hidden="true">{tier - 5}</span></span> : <span>★{tier}</span>}
            </dt>
            <dd className="h-1.5 overflow-hidden rounded-full bg-v2-inset">
              <span className="block h-full rounded-full" style={{ width: `${((tierCounts.get(tier) ?? 0) / maxCount) * 100}%`, backgroundColor: TIER_COLORS[formatTierKey(tier)] }} />
            </dd>
            <dd className="whitespace-nowrap text-right text-v2-fg-secondary tabular-nums">{(tierCounts.get(tier) ?? 0).toLocaleString()}명</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function RaidBossThumb({ boss }: { boss: string }) {
  const src = bossImageUrl(boss);
  const image = useImageFailure(src);
  return image.failed ? (
      <span className="flex h-14 w-[5.5rem] shrink-0 items-center justify-center rounded-md bg-v2-inset text-v2-fg-tertiary" aria-hidden="true">
      <PhotoIcon className="size-5" />
    </span>
  ) : (
    <img ref={image.ref} src={src} alt="" loading="lazy" onError={image.onError} className="h-14 w-[5.5rem] shrink-0 rounded-md bg-v2-inset object-cover" />
  );
}
