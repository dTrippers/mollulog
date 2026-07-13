import {
  getPostgresAllTimelineContentsMeta,
  getPostgresContentUidsByRecruitmentGroup,
  getPostgresFutureRaidContents,
  getPostgresTimelineContent,
  getPostgresTimelineContentDatesByContentUids,
  getPostgresTimelineContents,
  getPostgresTimelineContentsByContentTypes,
  getPostgresTimelineContentsByContentUids,
  getPostgresTimelineContentsByRecruitmentGroupUids,
  getPostgresTimelineContentsByUids,
  getPostgresUpcomingEvent,
} from "~/db/postgres/timeline-contents";
import type { TimelineContentType } from "~/domain/timeline-content";
import { cacheKey, fetchSourceCached } from "~/lib/cache";
import { nowUtcIso, type UtcIsoString } from "~/lib/date-time";

export type { RunType, TimelineContent, TimelineContentType, TimelineContentVideo } from "~/domain/timeline-content";
export { findEventsForRecruitmentStudent, groupTimelineContentsByRecruitmentGroupUid } from "~/models/timeline-content";

const ALL_TIMELINE_CONTENTS_META_CACHE_KEY = cacheKey("source", "timeline-content", 3, "all");

export type TimelineContentReadOptions = {
  ctx?: ExecutionContext;
};

export function getTimelineContent(env: Env, uid: string, options: TimelineContentReadOptions = {}) {
  return getPostgresTimelineContent(env, uid, { ctx: options.ctx });
}

export function getTimelineContents(env: Env, now = nowUtcIso(), options: TimelineContentReadOptions = {}) {
  return getPostgresTimelineContents(env, now, { ctx: options.ctx });
}

export function getUpcomingEvent(env: Env, options: TimelineContentReadOptions = {}) {
  return getPostgresUpcomingEvent(env, nowUtcIso(), { ctx: options.ctx });
}

export function getTimelineContentsByUids(env: Env, uids: string[], options: TimelineContentReadOptions = {}) {
  return getPostgresTimelineContentsByUids(env, uids, { ctx: options.ctx });
}

export function getFutureRaidContents(
  env: Env,
  contentTypes: TimelineContentType[],
  options: TimelineContentReadOptions = {},
) {
  return getPostgresFutureRaidContents(env, contentTypes, nowUtcIso(), { ctx: options.ctx });
}

export function getTimelineContentsByContentTypes(
  env: Env,
  contentTypes: TimelineContentType[],
  endAfter?: Date | UtcIsoString,
  options: TimelineContentReadOptions = {},
) {
  return getPostgresTimelineContentsByContentTypes(env, contentTypes, endAfter, { ctx: options.ctx });
}

export async function getTimelineContentDatesByContentUid(
  env: Env,
  contentUid: string,
  options: TimelineContentReadOptions = {},
): Promise<{ startAt: UtcIsoString; endAt: UtcIsoString | null } | null> {
  return (await getTimelineContentDatesByContentUids(env, [contentUid], options)).get(contentUid) ?? null;
}

export function getTimelineContentDatesByContentUids(
  env: Env,
  contentUids: string[],
  options: TimelineContentReadOptions = {},
) {
  return getPostgresTimelineContentDatesByContentUids(env, contentUids, { ctx: options.ctx });
}

export function getTimelineContentsByContentUids(
  env: Env,
  contentUids: string[],
  options: TimelineContentReadOptions = {},
) {
  return getPostgresTimelineContentsByContentUids(env, contentUids, { ctx: options.ctx });
}

export function getTimelineContentsByRecruitmentGroupUids(
  env: Env,
  recruitmentGroupUids: string[],
  options: TimelineContentReadOptions = {},
) {
  return getPostgresTimelineContentsByRecruitmentGroupUids(env, recruitmentGroupUids, { ctx: options.ctx });
}

export function getContentUidsByRecruitmentGroup(env: Env, options: TimelineContentReadOptions = {}) {
  return getPostgresContentUidsByRecruitmentGroup(env, { ctx: options.ctx });
}

export function syncAllTimelineContentsMeta(env: Env, forceRefresh = true, options: TimelineContentReadOptions = {}) {
  return fetchSourceCached(
    env,
    ALL_TIMELINE_CONTENTS_META_CACHE_KEY,
    () => getPostgresAllTimelineContentsMeta(env, { ctx: options.ctx }),
    forceRefresh,
  );
}

export function getAllTimelineContentsMeta(env: Env, options: TimelineContentReadOptions = {}) {
  return syncAllTimelineContentsMeta(env, false, options);
}
