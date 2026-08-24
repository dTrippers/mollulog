import { cacheKey, fetchRouteCached } from "~/lib/cache";
import { mapWithConcurrencyLimit } from "~/lib/concurrency";
import {
  compareInstantAsc,
  compareInstantDesc,
  getInstantTime,
  nowUtcIso,
  toUtcIso,
  type UtcIsoString,
} from "~/lib/date-time";
import { getEventContentSchedule, getEventContentsList, getEventShopContent } from "~/models/event-content";
import type { RunType } from "~/models/timeline-content";
import { getAllTimelineContentsMeta } from "~/models/timeline-content.server";

const EVENT_CONTENT_WARM_CONCURRENCY = 2;

type EventContentListSource = Awaited<ReturnType<typeof getEventContentsList>>[number];
type EventContentListSourceSchedule = EventContentListSource["schedules"][number];
export type EventListScheduleStatus = "past" | "current" | "upcoming";
export type EventListSchedule = {
  runType: RunType;
  since: UtcIsoString;
  until: UtcIsoString | null;
  status: EventListScheduleStatus;
};
export type CachedEventListSchedule = Omit<EventListSchedule, "status">;
export type CachedEventListItem = Omit<EventListItem, "schedules"> & {
  schedules: Partial<Record<RunType, CachedEventListSchedule>>;
};
export type EventListItem = {
  uid: string;
  name: string;
  imageUrl: string | null;
  fallbackImageUrl: string | null;
  latestTimelineUid: string;
  schedules: Partial<Record<RunType, EventListSchedule>>;
};

function getEventLogoImageUrl(eventUid: string, locale: "jp" | "kr"): string {
  return `https://assets.baql.net/images/events/logo/${encodeURIComponent(eventUid)}_${locale}.webp`;
}

function parseEventListRunType(runType: string): RunType | null {
  if (runType === "first" || runType === "rerun" || runType === "permanent") {
    return runType;
  }
  return null;
}

function getScheduleStatus(
  schedule: Pick<EventListSchedule, "since" | "until">,
  now: UtcIsoString,
): EventListScheduleStatus {
  const nowTime = getInstantTime(now);
  if (getInstantTime(schedule.since) > nowTime) {
    return "upcoming";
  }

  if (schedule.until === null || getInstantTime(schedule.until) > nowTime) {
    return "current";
  }

  return "past";
}

function groupEventListSchedules(schedules: EventContentListSourceSchedule[]): CachedEventListItem["schedules"] {
  const grouped: CachedEventListItem["schedules"] = {};
  for (const schedule of schedules) {
    if (schedule.region !== "gl") continue;

    const runType = parseEventListRunType(schedule.runType);
    if (!runType) continue;

    const nextSchedule = {
      runType,
      since: toUtcIso(schedule.startAt),
      until: schedule.endAt ? toUtcIso(schedule.endAt) : null,
    };
    const existing = grouped[runType];
    if (existing && compareInstantDesc(existing.since, nextSchedule.since) <= 0) {
      continue;
    }

    grouped[runType] = {
      ...nextSchedule,
    };
  }

  return grouped;
}

function compareEventContentUidAsc(a: string, b: string): number {
  const numericA = Number(a);
  const numericB = Number(b);
  if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
    return numericA - numericB;
  }
  return a.localeCompare(b);
}

function addEventListScheduleStatuses(event: CachedEventListItem, now: UtcIsoString): EventListItem {
  const schedules = Object.fromEntries(
    Object.entries(event.schedules).map(([runType, schedule]) => [
      runType,
      {
        ...schedule,
        status: getScheduleStatus(schedule, now),
      },
    ]),
  ) as EventListItem["schedules"];

  return {
    ...event,
    schedules,
  };
}

async function getEventListCachedItems(
  env: Env,
  forceRefresh: boolean,
  ctx?: ExecutionContext,
): Promise<CachedEventListItem[]> {
  return fetchRouteCached<CachedEventListItem[]>(
    env,
    ctx,
    cacheKey("route", "events", 3, "list"),
    async () => {
      const [eventContents, timelineContents] = await Promise.all([
        getEventContentsList(env, forceRefresh),
        getAllTimelineContentsMeta(env, { ctx }),
      ]);

      const timelineContentByContentUid = new Map<
        string,
        {
          first: { name: string; startAt: UtcIsoString };
          latest: { uid: string; startAt: UtcIsoString };
        }
      >();
      for (const content of timelineContents) {
        if (content.contentType !== "event" || !content.contentUid) continue;

        const existing = timelineContentByContentUid.get(content.contentUid);
        if (!existing) {
          timelineContentByContentUid.set(content.contentUid, {
            first: { name: content.name, startAt: content.startAt },
            latest: { uid: content.uid, startAt: content.startAt },
          });
          continue;
        }

        if (compareInstantAsc(content.startAt, existing.first.startAt) < 0) {
          existing.first = { name: content.name, startAt: content.startAt };
        }

        if (compareInstantDesc(content.startAt, existing.latest.startAt) < 0) {
          existing.latest = { uid: content.uid, startAt: content.startAt };
        }
      }

      return eventContents
        .flatMap((eventContent) => {
          const timelineContent = timelineContentByContentUid.get(eventContent.uid) ?? null;
          if (!timelineContent) {
            return [];
          }

          return {
            uid: eventContent.uid,
            name: timelineContent.first.name || eventContent.name,
            imageUrl: getEventLogoImageUrl(eventContent.uid, "kr"),
            fallbackImageUrl: getEventLogoImageUrl(eventContent.uid, "jp"),
            latestTimelineUid: timelineContent.latest.uid,
            schedules: groupEventListSchedules(eventContent.schedules),
          };
        })
        .sort((a, b) => compareEventContentUidAsc(a.uid, b.uid));
    },
    forceRefresh,
  );
}

export async function getEventList(
  env: Env,
  now: UtcIsoString = nowUtcIso(),
  forceRefresh = false,
  ctx?: ExecutionContext,
): Promise<EventListItem[]> {
  const cachedEvents = await getEventListCachedItems(env, forceRefresh, ctx);
  return cachedEvents.map((event) => addEventListScheduleStatuses(event, now));
}

export async function warmActiveUpcomingEventContent(
  env: Env,
  forceRefresh = false,
  ctx?: ExecutionContext,
): Promise<void> {
  const events = await getEventList(env, undefined, forceRefresh, ctx);
  const warmTasks: Array<() => Promise<unknown>> = [];
  const shopTimelineUids = new Set<string>();

  for (const event of events) {
    const activeUpcomingSchedules = Object.values(event.schedules).filter(
      (schedule): schedule is EventListSchedule => schedule.status === "current" || schedule.status === "upcoming",
    );
    if (activeUpcomingSchedules.length === 0) {
      continue;
    }

    shopTimelineUids.add(event.latestTimelineUid);
    for (const schedule of activeUpcomingSchedules) {
      warmTasks.push(() => getEventContentSchedule(env, event.uid, schedule.runType, forceRefresh));
    }
  }

  for (const timelineUid of shopTimelineUids) {
    warmTasks.push(() => getEventShopContent(env, timelineUid, forceRefresh, ctx));
  }

  await mapWithConcurrencyLimit(warmTasks, EVENT_CONTENT_WARM_CONCURRENCY, (task) => task());
}
