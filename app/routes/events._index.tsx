import { CheckIcon } from "@heroicons/react/16/solid";
import { FunnelIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { Page } from "~/components/features/layout";
import { EmptyView, PanelBody, PanelIconToggleRow, PanelSearchField } from "~/components/primitives";
import { withD1Session } from "~/lib/d1-session";
import { formatInstant, nowUtcIso } from "~/lib/date-time";
import type { RunType } from "~/models/timeline-content";
import { type EventFilterState, filterEventList } from "~/views/event-list-filter";
import { type EventListItem, type EventListSchedule, getEventList } from "~/views/events";

const GL_TIME_ZONE = "Asia/Seoul";
const runTypeLabels: Record<RunType, string> = {
  first: "개최",
  rerun: "복각",
  permanent: "상설",
};
const scheduleOrder: RunType[] = ["first", "rerun", "permanent"];
const scheduleRowClassName = "grid grid-cols-[2rem_max-content_1fr] items-center gap-x-2 text-xs leading-5";

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
  const publicReadEnv = withD1Session(env, "first-unconstrained");
  return { events: await getEventList(publicReadEnv, now, false, ctx), now };
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
  if (
    schedule.status === "past" ||
    (schedule.status === "current" && (schedule.runType === "permanent" || schedule.until === null))
  ) {
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
      <span className="whitespace-nowrap tabular-nums text-foreground">{formatScheduleDate(schedule)}</span>
      <div className="justify-self-end">
        <StatusBadge schedule={schedule} />
      </div>
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
    <PanelBody>
      <p className="text-xs text-muted-foreground">{countText}</p>
      <PanelIconToggleRow
        title="다가오는 이벤트만 보기"
        active={filter.onlyUpcoming}
        emphasis="strong"
        Icon={CheckIcon}
        onChange={(active) => onFilterChange({ ...filter, onlyUpcoming: active })}
      />
      <PanelSearchField
        label="이름으로 찾기"
        value={filter.search}
        placeholder="이벤트 이름"
        onChange={(search) => onFilterChange({ ...filter, search })}
      />
    </PanelBody>
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
    <article className="h-full overflow-hidden rounded-lg bg-card shadow-md shadow-black/5 transition-shadow hover:shadow-lg dark:shadow-sm dark:shadow-black/20 dark:hover:shadow-md">
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
        <div className="grid gap-3 py-4 sm:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
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
