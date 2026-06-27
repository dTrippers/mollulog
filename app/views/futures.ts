import type { Attack, Defense, RecruitmentTypeEnum } from "~/graphql/graphql";
import { normalizeInstant, type UtcIsoString, isInstantAfter, nowUtcIso, toUtcIso } from "~/lib/date-time";
import { cacheKey, fetchRouteCached } from "~/lib/cache";
import {
  type getRecruitmentGroupByUid,
  getRecruitmentGroupsByUids,
} from "~/models/recruitment";
import { getRecruitmentFavoriteKey } from "~/models/recruitment-identity";
import { getTimelineContents } from "~/models/timeline-content";
import type { TimelineContent } from "~/models/timeline-content";
import type { Role } from "~/models/content.d";
import { getUpcomingRaidContents, type RaidInfo } from "./raid-content";

const FUTURE_CONTENTS_CACHE_KEY = cacheKey("route", "futures", 1, "all");

export type RecruitmentInfo = {
  recruitmentType: RecruitmentTypeEnum;
  pickup: boolean;
  rerun: boolean;
  since: UtcIsoString;
  until: UtcIsoString | null;
  studentName: string;
  favoriteKey: string;
  student: {
    uid: string;
    attackType?: Attack;
    defenseType?: Defense;
    role?: Role;
    schaleDbId?: string | null;
  } | null;
};

export type FutureContent = TimelineContent & {
  recruitments: RecruitmentInfo[];
  raidInfo?: RaidInfo;
};

function normalizeInstantValue(value: string | Date | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  return normalizeInstant(value instanceof Date ? value.toISOString() : value);
}

export function normalizeFutureContentDates(content: FutureContent): FutureContent {
  return {
    ...content,
    startAt: normalizeInstantValue(content.startAt) ?? normalizeInstant(content.startAt),
    endAt: normalizeInstantValue(content.endAt),
    syncedAt: normalizeInstantValue(content.syncedAt),
    recruitments: content.recruitments.map((recruitment) => ({
      ...recruitment,
      since: normalizeInstantValue(recruitment.since) ?? normalizeInstant(recruitment.since),
      until: normalizeInstantValue(recruitment.until),
    })),
  };
}

export function toRecruitmentInfos(group: Awaited<ReturnType<typeof getRecruitmentGroupByUid>>): RecruitmentInfo[] {
  return (group?.recruitments ?? [])
    .sort((a, b) => Number(a.rerun) - Number(b.rerun))
    .map((r) => ({
      recruitmentType: r.recruitmentType,
      pickup: r.pickup,
      rerun: r.rerun,
      since: toUtcIso(r.since),
      until: r.until ? toUtcIso(r.until) : null,
      studentName: r.studentName,
      favoriteKey: getRecruitmentFavoriteKey(r),
      student: r.student
        ? {
            uid: r.student.uid,
            attackType: r.student.attackType,
            defenseType: r.student.defenseType,
            role: r.student.role as Role | undefined,
            schaleDbId: r.student.schaleDbId,
          }
        : null,
    }));
}

export async function getFutureContents(
  env: Env,
  forceRefresh = false,
  ctx?: ExecutionContext,
): Promise<FutureContent[]> {
  const allEnriched = await fetchRouteCached(
    env,
    ctx,
    FUTURE_CONTENTS_CACHE_KEY,
    async () => {
      const [contents, upcomingRaidContents] = await Promise.all([
        getTimelineContents(env),
        getUpcomingRaidContents(env, { forceRefresh }),
      ]);
      const upcomingRaidMap = new Map(upcomingRaidContents.map((content) => [content.uid, content]));
      const recruitmentGroupUids = contents
        .map((content) => content.recruitmentGroupUid)
        .filter((uid) => uid !== null) as string[];
      const recruitmentGroups = await getRecruitmentGroupsByUids(env, recruitmentGroupUids, forceRefresh);
      const recruitmentGroupMap = new Map(recruitmentGroups.map((group) => [group.uid, group]));

      return Promise.all(
        contents.map(async (content) => {
          if (content.contentType === "raid") {
            return { ...content, recruitments: [], raidInfo: upcomingRaidMap.get(content.uid)?.raidInfo };
          }

          if (content.recruitmentGroupUid) {
            const group = recruitmentGroupMap.get(content.recruitmentGroupUid) ?? null;
            return { ...content, recruitments: toRecruitmentInfos(group) };
          }

          return { ...content, recruitments: [] };
        }),
      );
    },
    forceRefresh,
  );

  const now = nowUtcIso();
  return allEnriched
    .map(normalizeFutureContentDates)
    .filter((content) => (content.endAt ? isInstantAfter(content.endAt, now) : isInstantAfter(content.startAt, now)));
}
