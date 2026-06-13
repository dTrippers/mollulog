import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Page } from "~/components/features/layout";
import { EmptyView } from "~/components/primitives";
import { formatInstant } from "~/lib/date-time";
import { type EventListItem, type EventListSchedule, getEventList } from "~/models/event-content";
import type { RunType } from "~/models/timeline-content";

const GL_TIME_ZONE = "Asia/Seoul";
const runTypeLabels: Record<RunType, string> = {
  first: "개최",
  rerun: "복각",
  permanent: "상설",
};
const scheduleOrder: RunType[] = ["first", "rerun", "permanent"];
const scheduleRowClassName = "flex items-center gap-x-2 text-xs leading-5";

export const meta: MetaFunction = () => {
  const title = "블루 아카이브 이벤트 목록";
  const description = "블루 아카이브 한국 서버의 이벤트 개최, 복각, 상설 일정을 확인해보세요";
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
  const { env } = context.cloudflare;
  return { events: await getEventList(env) };
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
      <span className="w-8 shrink-0 text-neutral-500 dark:text-neutral-400">{runTypeLabels[schedule.runType]}</span>
      <span className="min-w-0 flex-1 tabular-nums text-neutral-700 dark:text-neutral-300">
        {formatScheduleDate(schedule)}
      </span>
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
    <div className="flex aspect-[3/1] w-28 shrink-0 items-center justify-center rounded bg-neutral-100 text-xs font-medium text-neutral-400 dark:bg-neutral-900 dark:text-neutral-600 md:w-32">
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
        <h2 className="w-full min-w-0 whitespace-pre-line break-keep text-sm font-normal leading-snug text-neutral-950 dark:text-neutral-50">
          {event.name}
        </h2>
      </div>
      <div className="min-w-0 space-y-1 border-t border-neutral-100 bg-neutral-50/50 px-3 py-2.5 dark:border-neutral-700/80 dark:bg-neutral-900/20 md:px-4">
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
          <p className="text-sm text-neutral-500 dark:text-neutral-400">GL 서버 일정 정보가 없어요</p>
        )}
      </div>
    </div>
  );
  return (
    <article className="h-full overflow-hidden rounded-md border border-neutral-200 bg-white transition dark:border-neutral-700/80 dark:bg-neutral-800/50">
      <Link
        to={`/events/${event.latestTimelineUid}`}
        className="block h-full transition hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
      >
        {body}
      </Link>
    </article>
  );
}

export default function EventsIndex() {
  const { events } = useLoaderData<typeof loader>();

  return (
    <Page
      title="이벤트 목록"
      description="블루 아카이브 한국 서버의 일반 이벤트 일정을 확인해보세요"
      contentArea="4xl"
      layout="vertical"
    >
      {events.length > 0 ? (
        <div className="grid gap-3 py-4 md:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.uid} event={event} />
          ))}
        </div>
      ) : (
        <EmptyView text="표시할 이벤트가 없어요." />
      )}
    </Page>
  );
}
