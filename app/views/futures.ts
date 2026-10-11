import type { MinigameConfig } from "~/domain/event-shop";
import { filterRecruitmentsByStudentUids, getRecruitmentFavoriteKey } from "~/domain/recruitment-identity";
import type { RecruitmentPeriod } from "~/domain/recruitment-period-notice";
import type { Attack, Defense, RecruitmentTypeEnum } from "~/graphql/graphql";
import { cacheKey, fetchRouteCached } from "~/lib/cache";
import { mapWithConcurrencyLimit } from "~/lib/concurrency";
import { isInstantAfter, normalizeInstant, nowUtcIso, toUtcIso, type UtcIsoString } from "~/lib/date-time";
import type { Role } from "~/models/content.d";
import { getEventMinigameType } from "~/models/event-content";
import {
  type getRecruitmentGroupByUid,
  getRecruitmentGroupsByUidsStrict,
  normalizeRecruitmentGroupPeriod,
} from "~/models/recruitment";
import type { TimelineContent } from "~/models/timeline-content";
import { getTimelineContents } from "~/models/timeline-content.server";
import { getUpcomingRaidContents, type RaidInfo } from "./raid-content";

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
  minigameType: MinigameConfig["minigameType"] | null;
  recruitments: RecruitmentInfo[];
  recruitmentPeriod: RecruitmentPeriod | null;
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
    recruitmentPeriod: content.recruitmentPeriod
      ? {
          startAt:
            normalizeInstantValue(content.recruitmentPeriod.startAt) ??
            normalizeInstant(content.recruitmentPeriod.startAt),
          endAt: normalizeInstantValue(content.recruitmentPeriod.endAt),
        }
      : null,
    recruitments: content.recruitments.map((recruitment) => ({
      ...recruitment,
      since: normalizeInstantValue(recruitment.since) ?? normalizeInstant(recruitment.since),
      until: normalizeInstantValue(recruitment.until),
    })),
  };
}

export function toRecruitmentInfos(
  group: Awaited<ReturnType<typeof getRecruitmentGroupByUid>>,
  studentUids: string[] | null = null,
): RecruitmentInfo[] {
  return filterRecruitmentsByStudentUids(group?.recruitments ?? [], studentUids)
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
    cacheKey("route", "futures", 4, "all"),
    async () => {
      const [contents, upcomingRaidContents] = await Promise.all([
        getTimelineContents(env, nowUtcIso(), { ctx }),
        getUpcomingRaidContents(env, { forceRefresh, ctx }),
      ]);
      const upcomingRaidMap = new Map(upcomingRaidContents.map((content) => [content.uid, content]));
      const recruitmentGroupUids = contents
        .map((content) => content.recruitmentGroupUid)
        .filter((uid) => uid !== null) as string[];
      const recruitmentGroups = await getRecruitmentGroupsByUidsStrict(env, recruitmentGroupUids, forceRefresh);
      const recruitmentGroupMap = new Map(recruitmentGroups.map((group) => [group.uid, group]));

      // Enrich only when rebuilding the shared route cache, with bounded source lookups.
      return mapWithConcurrencyLimit(contents, 4, async (content) => {
        const group = content.recruitmentGroupUid
          ? (recruitmentGroupMap.get(content.recruitmentGroupUid) ?? null)
          : null;
        if (content.recruitmentGroupUid && !group) {
          throw new Error(`recruitment group not found: ${content.recruitmentGroupUid}`);
        }
        const recruitmentPeriod = group ? normalizeRecruitmentGroupPeriod(group) : null;

        if (content.contentType === "raid") {
          return {
            ...content,
            minigameType: null,
            recruitments: [],
            recruitmentPeriod,
            raidInfo: upcomingRaidMap.get(content.uid)?.raidInfo,
          };
        }

        const minigameType =
          content.contentType === "live" ? null : await getEventMinigameType(env, content, forceRefresh);

        if (group) {
          return {
            ...content,
            minigameType,
            recruitments: toRecruitmentInfos(group, content.recruitmentStudentUids),
            recruitmentPeriod,
          };
        }

        return { ...content, minigameType, recruitments: [], recruitmentPeriod };
      });
    },
    forceRefresh,
  );

  const now = nowUtcIso();
  return allEnriched
    .map(normalizeFutureContentDates)
    .filter((content) => (content.endAt ? isInstantAfter(content.endAt, now) : isInstantAfter(content.startAt, now)));
}
