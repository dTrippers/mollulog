import { CheckIcon } from "@heroicons/react/16/solid";
import { FunnelIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Page } from "~/components/features/layout";
import { EmptyView, PanelOptionIconButton } from "~/components/primitives";
import { formatInstant, nowUtcIso } from "~/lib/date-time";
import { filterEventList, type EventFilterState } from "~/views/event-list-filter";
import type { RunType } from "~/models/timeline-content";
import { type EventListItem, type EventListSchedule, getEventList } from "~/views/events";

const GL_TIME_ZONE = "Asia/Seoul";
const runTypeLabels: Record<RunType, string> = {
  first: "개최",
  rerun: "복각",
  permanent: "상설",
};
const scheduleOrder: RunType[] = ["first", "rerun", "permanent"];
const scheduleRowClassName = "flex items-center gap-x-2 text-xs leading-5";

const defaultFilter: EventFilterState = {
  onlyUpcoming: false,
  search: "",
};

export const meta: MetaFunction = () => {
  const title = "블루 아카이브 이벤트";
  const description = "블루 아카이브의 이벤트 개최 일정을 확인해보세요";
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
};

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const now = nowUtcIso();
  return { events: await getEventList(env, now, false, ctx), now };
};

function formatEventDate(value: string, format = "YY.MM.DD"): string {
  return formatInstant(value, { timeZone: GL_TIME_ZONE, format });
}

function formatScheduleDate(schedule: EventListSchedule): string {
  if (schedule.runType === "permanent" || schedule.until === null) {
    return formatEventDate(schedule.since);
  }

  const startYear = formatEventDate(schedule.since, "YY");
  const endYear = formatEventDate(schedule.until, "YY");
  const endFormat = startYear === endYear ? "MM.DD" : "YY.MM.DD";
  return `${formatEventDate(schedule.since)} ~ ${formatEventDate(schedule.until, endFormat)}`;
}

function StatusBadge({ schedule }: { schedule: EventListSchedule }) {
  if (schedule.status === "past" || (schedule.runType === "permanent" && schedule.status === "current")) {
    return null;
  }

  const className =
    schedule.status === "current"
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
      : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";

  return (
    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {schedule.status === "current" ? "진행중" : "예정"}
    </span>
  );
}

function EventScheduleRow({ schedule }: { schedule: EventListSchedule }) {
  return (
    <div className={scheduleRowClassName}>
      <span className="w-8 shrink-0 text-muted-foreground">{runTypeLabels[schedule.runType]}</span>
      <span className="min-w-0 flex-1 tabular-nums text-foreground">{formatScheduleDate(schedule)}</span>
      <StatusBadge schedule={schedule} />
    </div>
  );
}

function EventSchedulePlaceholder({ runType }: { runType: RunType }) {
  return (
    <div className={`${scheduleRowClassName} invisible`} aria-hidden="true">
      <span className="w-8 shrink-0">{runTypeLabels[runType]}</span>
      <span className="min-w-0 flex-1">00.00.00 ~ 00.00</span>
    </div>
  );
}

function EventFilterPanel({
  filter,
  onFilterChange,
  countText,
}: {
  filter: EventFilterState;
  onFilterChange: (filter: EventFilterState) => void;
  countText: string;
}) {
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-muted-foreground">{countText}</p>
      <div className="space-y-1">
        <FilterToggleRow
          title="다가오는 이벤트만 보기"
          checked={filter.onlyUpcoming}
          onChange={(checked) => onFilterChange({ ...filter, onlyUpcoming: checked })}
        />
      </div>

      <div className="space-y-1">
        <label className="block px-3 py-2 lg:px-2.5 lg:py-1.5">
          <span className="block text-sm font-medium text-foreground">이름으로 찾기</span>
          <span className="mt-2 flex h-9 items-center rounded-md border border-input bg-background px-2 text-muted-foreground">
            <MagnifyingGlassIcon className="mr-2 size-4 shrink-0" />
            <input
              type="search"
              value={filter.search}
              onChange={(event) => onFilterChange({ ...filter, search: event.currentTarget.value })}
              placeholder="이벤트 이름"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
          </span>
        </label>
      </div>
    </div>
  );
}

function FilterToggleRow({
  title,
  checked,
  onChange,
}: {
  title: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-md px-3 py-2 transition-colors hover:bg-muted lg:px-2.5 lg:py-1.5">
      <div className="flex min-h-8 items-center gap-2 lg:min-h-7 lg:gap-1.5">
        <p className="min-w-0 grow text-sm font-medium text-foreground">{title}</p>
        <PanelOptionIconButton label={title} active={checked} Icon={CheckIcon} onClick={() => onChange(!checked)} />
      </div>
    </div>
  );
}

function EventBanner({ event }: { event: EventListItem }) {
  const [imageUrl, setImageUrl] = useState(event.imageUrl);

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={event.name}
        loading="lazy"
        onError={() => {
          setImageUrl((current) =>
            event.fallbackImageUrl && current !== event.fallbackImageUrl ? event.fallbackImageUrl : null,
          );
        }}
        className="aspect-[3/1] w-28 shrink-0 object-contain md:w-32"
      />
    );
  }

  return (
    <div className="flex aspect-[3/1] w-28 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground md:w-32">
      EVENT
    </div>
  );
}

function EventCard({ event }: { event: EventListItem }) {
  const schedules = scheduleOrder.flatMap((runType) => {
    const schedule = event.schedules[runType];
    return schedule ? [schedule] : [];
  });

  const body = (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
      <div className="flex min-w-0 justify-center px-3 pt-3 pb-2 md:px-4">
        <EventBanner event={event} />
      </div>
      <div className="flex min-w-0 items-center px-3 pb-3 text-center md:px-4">
        <h2 className="w-full min-w-0 whitespace-pre-line break-keep text-sm font-normal leading-snug text-foreground">
          {event.name}
        </h2>
      </div>
      <div className="min-w-0 space-y-1 bg-muted/40 px-3 py-2.5 md:px-4">
        {schedules.length > 0 ? (
          scheduleOrder.map((runType) => {
            const schedule = event.schedules[runType];
            return schedule ? (
              <EventScheduleRow key={runType} schedule={schedule} />
            ) : (
              <EventSchedulePlaceholder key={runType} runType={runType} />
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">GL 서버 일정 정보가 없어요</p>
        )}
      </div>
    </div>
  );
  return (
    <article className="h-full overflow-hidden rounded-lg bg-card transition-shadow hover:shadow-sm">
      <Link to={`/events/${event.latestTimelineUid}`} className="block h-full transition-colors hover:bg-muted/50">
        {body}
      </Link>
    </article>
  );
}

export default function EventsIndex() {
  const { events, now } = useLoaderData<typeof loader>();
  const [filter, setFilter] = useState<EventFilterState>(defaultFilter);
  const filteredEvents = useMemo(() => filterEventList(events, filter, now), [events, filter, now]);
  const countText =
    events.length === filteredEvents.length
      ? `총 ${events.length.toLocaleString()}개`
      : `총 ${events.length.toLocaleString()}개 중 ${filteredEvents.length.toLocaleString()}개 표시`;

  return (
    <Page
      title="이벤트"
      description="블루 아카이브의 이벤트 개최 일정을 확인해보세요"
      contentWidth="full"
      panels={[
        {
          title: "이벤트 필터",
          Icon: FunnelIcon,
          children: <EventFilterPanel filter={filter} onFilterChange={setFilter} countText={countText} />,
        },
      ]}
    >
      {filteredEvents.length > 0 && (
        <div className="grid gap-3 py-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEvents.map((event) => (
            <EventCard key={event.uid} event={event} />
          ))}
        </div>
      )}
      {filteredEvents.length === 0 && (
        <EmptyView text={events.length > 0 ? "필터 조건에 맞는 이벤트가 없어요." : "표시할 이벤트가 없어요."} />
      )}
    </Page>
  );
}
