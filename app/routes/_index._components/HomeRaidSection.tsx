import { ChevronRightIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { RaidSummary } from "~/components/v2/features/futures/FutureTimeline";
import { getHomeOngoingChip, getHomeUpcomingChip, type HomeTimeChip as HomeTimeChipValue } from "~/domain/home-portal";
import { raidTypeToParam } from "~/domain/raid";
import type { UtcIsoString } from "~/lib/date-time";
import { raidTypeLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import type { HomeRaidSlot, HomeRaidSlots, HomeSourceResult } from "~/views/home";
import type { TimelineRaidContent } from "~/views/raid-content";
import { HomeRetryButton, HomeSection, HomeTile, HomeTimeChip } from "./HomePrimitives";

function raidChip(content: TimelineRaidContent, now: UtcIsoString, timeZone: string): HomeTimeChipValue {
  if (content.endAt && new Date(content.startAt) <= new Date(now)) {
    return getHomeOngoingChip(content.endAt, now, timeZone);
  }
  return getHomeUpcomingChip(content.startAt, now, timeZone);
}

// The boss image is flush to the tile's left, top, and bottom edges, and the tile's radius clips it.
function RaidTile({ content, now, timeZone }: { content: TimelineRaidContent; now: UtcIsoString; timeZone: string }) {
  const schedule = content.raidSchedule;
  if (!schedule) {
    return null;
  }
  const seasonLabel = `${raidTypeLocale[schedule.raidType as keyof typeof raidTypeLocale]} ${schedule.seasonIndex}`;
  return (
    <Link
      to={`/raids/${raidTypeToParam(schedule.raidType)}/${schedule.seasonIndex}`}
      className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-lg bg-v2-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
    >
      <img
        src={bossImageUrl(schedule.raidBoss.uid)}
        alt=""
        loading="lazy"
        className="w-24 shrink-0 bg-v2-inset object-cover object-[50%_30%]"
      />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-v2-fg-tertiary md:text-sm">{seasonLabel}</p>
          <HomeTimeChip chip={raidChip(content, now, timeZone)} dense />
        </div>
        <p className="text-base leading-6 font-semibold break-keep text-v2-fg md:text-lg md:leading-7">
          {schedule.raidBoss.name}
          <ChevronRightIcon
            aria-hidden="true"
            className="ml-1 inline-block size-3.5 shrink-0 align-middle text-v2-fg-tertiary md:size-4"
          />
        </p>
        <RaidSummary raid={schedule} />
      </div>
    </Link>
  );
}

function RaidSlotColumn({
  label,
  slot,
  now,
  timeZone,
  onRetry,
}: {
  label: string;
  slot: HomeRaidSlot | null;
  now: UtcIsoString;
  timeZone: string;
  onRetry: () => void;
}) {
  if (slot === null) {
    return (
      <HomeTile
        dense
        className="flex-1"
        label={label}
        icon={<ShieldCheckIcon aria-hidden="true" className="size-4 shrink-0" />}
        name="일정을 불러오지 못했어요"
        detail={<HomeRetryButton onClick={onRetry} />}
      />
    );
  }
  if (slot.ongoing.length > 0) {
    return (
      <>
        {slot.ongoing.map((content) => (
          <RaidTile key={content.uid} content={content} now={now} timeZone={timeZone} />
        ))}
      </>
    );
  }
  if (slot.upcoming) {
    return <RaidTile content={slot.upcoming} now={now} timeZone={timeZone} />;
  }
  return (
    <HomeTile
      dense
      className="flex-1"
      label={label}
      icon={<ShieldCheckIcon aria-hidden="true" className="size-4 shrink-0" />}
      name="예정된 시즌이 없어요"
      detail={
        <Link
          to="/futures"
          className="-my-3 inline-flex min-h-11 items-center gap-0.5 text-v2-fg-secondary hover:text-v2-fg"
        >
          미래시에서 보기
          <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-v2-fg-tertiary md:size-4" />
        </Link>
      }
    />
  );
}

export function HomeRaidSection({
  raids,
  now,
  timeZone,
  onRetry,
}: {
  raids: HomeSourceResult<HomeRaidSlots>;
  now: UtcIsoString;
  timeZone: string;
  onRetry: () => void;
}) {
  const total = raids.status === "success" ? raids.data.total : null;
  const unlimit = raids.status === "success" ? raids.data.unlimit : null;
  return (
    <HomeSection id="home-raids" title="레이드">
      <div className="grid gap-2 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <RaidSlotColumn label="총력전·대결전" slot={total} now={now} timeZone={timeZone} onRetry={onRetry} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <RaidSlotColumn label="제약해제결전" slot={unlimit} now={now} timeZone={timeZone} onRetry={onRetry} />
        </div>
      </div>
    </HomeSection>
  );
}
