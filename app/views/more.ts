import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { type PickupResources, buildTimeline } from "~/domain/pyroxene-timeline";
import { getInstantTime, isInstantAfter, nowUtcIso } from "~/lib/date-time";
import { getAllCoupons, getCouponRegistrations } from "~/models/coupon";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { getPickupHistories } from "~/models/pickup-history";
import {
  type PyroxeneEventData,
  type PyroxeneTimelineItem,
  getAllPyroxeneEventData,
  getCollectedSourceKeys,
  getLatestPyroxeneOwnedResource,
  getPyroxenePlannerOptions,
  getPyroxeneTimelineItems,
} from "~/models/pyroxene-planner";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getRecruitmentResultsByRecruitmentGroupUids } from "~/models/recruitment-result";
import { getRelationshipLevels } from "~/models/relationship-level";
import type { Sensei } from "~/models/sensei";
import { getNavigationBarContents } from "~/views/navigation";
import { getPyroxenePlannerContents } from "~/views/pyroxene";

export type MoreCurrentUser = {
  username: string;
  profileStudentId: string | null;
  recruitedStudentCount: number;
  pickupHistoryCount: number;
  availableCouponCount: number;
  pyroxene: {
    pyroxene: number;
    oneTimeTicket: number;
    tenTimeTicket: number;
    favoritedRecruitmentCount: number;
    nextStudents: { uid: string; name: string }[];
    nextTimelineLabel: string | null;
    expectedPyroxene: number | null;
  } | null;
  relationship: {
    savedCount: number;
    targetStudentCount: number;
    targetStudents: {
      uid: string;
      currentLevel: number;
    }[];
  };
};

export async function getMoreViewData(env: Env, ctx: ExecutionContext, sensei: Sensei | null) {
  const [navigationBarContents, personalSummary] = await Promise.all([
    getNavigationBarContents(env, false, sensei?.id, ctx),
    sensei ? getMorePersonalSummary(env, sensei.id) : Promise.resolve(null),
  ]);

  return {
    currentUser: sensei && personalSummary ? await buildCurrentUserSummary(env, sensei, personalSummary) : null,
    upcomingEvent: navigationBarContents.upcomingEvent,
    hasRecentNews: navigationBarContents.hasRecentNews,
    hasUnconsumedCoupons: navigationBarContents.hasUnconsumedCoupons,
    hasUnreadFeedbackReplies: navigationBarContents.hasUnreadFeedbackReplies,
  };
}

type MorePersonalSummary = Awaited<ReturnType<typeof getMorePersonalSummary>>;

function getMorePersonalSummary(env: Env, senseiId: number) {
  return Promise.all([
    getRecruitedStudents(env, senseiId),
    getPickupHistories(env, senseiId),
    getLatestPyroxeneOwnedResource(env, senseiId),
    getPyroxenePlannerContents(env),
    getUserFavoritedStudents(env, senseiId),
    getPyroxenePlannerOptions(env, senseiId),
    getAllPyroxeneEventData(env, senseiId),
    getPyroxeneTimelineItems(env, senseiId),
    getCollectedSourceKeys(env, senseiId),
    getRelationshipLevels(env, senseiId),
    getCouponRegistrations(env, senseiId),
    getAllCoupons(env),
  ]);
}

async function buildCurrentUserSummary(
  env: Env,
  sensei: Sensei,
  personalSummary: MorePersonalSummary,
): Promise<MoreCurrentUser> {
  const now = nowUtcIso();
  const [
    recruitedStudents,
    pickupHistories,
    latestPyroxeneResources,
    pyroxeneContents,
    favoritedStudents,
    pyroxeneOptions,
    pyroxeneEventData,
    pyroxeneTimelineItems,
    collectedSourceKeys,
    relationshipLevels,
    couponRegistrations,
    coupons,
  ] = personalSummary;
  const recruitmentGroupUids = pyroxeneContents.flatMap((content) =>
    content.kind === "event" && content.recruitmentGroupUid ? [content.recruitmentGroupUid] : [],
  );
  const recruitmentResults =
    recruitmentGroupUids.length > 0
      ? await getRecruitmentResultsByRecruitmentGroupUids(env, sensei.id, recruitmentGroupUids)
      : [];
  const completedRecruitmentGroupUids = new Set(
    recruitmentResults.flatMap((result) => (result.completedAt ? [result.recruitmentGroupUid] : [])),
  );
  const favoritedRecruitments = getFavoritedRecruitments(
    pyroxeneContents,
    favoritedStudents,
    completedRecruitmentGroupUids,
    now,
  );
  const nextFavoritedRecruitment = favoritedRecruitments[0] ?? null;
  const pyroxeneTimeline = latestPyroxeneResources
    ? buildTimeline(
        {
          pyroxene: latestPyroxeneResources.pyroxene,
          oneTimeTicket: latestPyroxeneResources.oneTimeTicket,
          tenTimeTicket: latestPyroxeneResources.tenTimeTicket,
        },
        new Date(latestPyroxeneResources.inputAt),
        buildPyroxeneEventDataMap(pyroxeneEventData, pyroxeneContents, recruitmentResults),
        buildPyroxeneScheduleItems(pyroxeneContents, favoritedStudents, pyroxeneTimelineItems),
        pyroxeneOptions,
        undefined,
        [...collectedSourceKeys],
      )
    : [];
  const nextPyroxeneTimelineEntry = nextFavoritedRecruitment
    ? (pyroxeneTimeline.find(
        ({ source }) => source.type === "event" && source.event?.uid === nextFavoritedRecruitment.uid,
      ) ?? null)
    : null;
  const registeredCouponIds = new Set(couponRegistrations);
  const relationshipTargets = relationshipLevels
    .filter(({ currentLevel, targetLevel }) => targetLevel > currentLevel)
    .sort((a, b) => b.currentLevel - a.currentLevel || b.targetLevel - a.targetLevel);
  const relationshipTargetStudents = relationshipTargets.slice(0, 3).map(({ studentId, currentLevel }) => ({
    uid: studentId,
    currentLevel,
  }));

  return {
    username: sensei.username,
    profileStudentId: sensei.profileStudentId,
    recruitedStudentCount: recruitedStudents.length,
    pickupHistoryCount: pickupHistories.length,
    availableCouponCount: coupons.filter(
      (coupon) =>
        !registeredCouponIds.has(coupon.id) && (coupon.expiresAt === null || isInstantAfter(coupon.expiresAt, now)),
    ).length,
    pyroxene: latestPyroxeneResources
      ? {
          pyroxene: latestPyroxeneResources.pyroxene,
          oneTimeTicket: latestPyroxeneResources.oneTimeTicket,
          tenTimeTicket: latestPyroxeneResources.tenTimeTicket,
          favoritedRecruitmentCount: favoritedRecruitments.length,
          nextStudents: nextFavoritedRecruitment?.students ?? [],
          nextTimelineLabel: nextFavoritedRecruitment
            ? getRecruitmentScheduleLabel(nextFavoritedRecruitment.since, nextFavoritedRecruitment.until, now)
            : null,
          expectedPyroxene: nextPyroxeneTimelineEntry?.accumulatedResources.pyroxene ?? null,
        }
      : null,
    relationship: {
      savedCount: relationshipLevels.length,
      targetStudentCount: relationshipTargets.length,
      targetStudents: relationshipTargetStudents,
    },
  };
}

type MorePyroxeneContent = Awaited<ReturnType<typeof getPyroxenePlannerContents>>[number];
type MoreFavoritedStudent = Awaited<ReturnType<typeof getUserFavoritedStudents>>[number];

function getFavoritedRecruitments(
  contents: MorePyroxeneContent[],
  favoritedStudents: MoreFavoritedStudent[],
  completedRecruitmentGroupUids: Set<string>,
  now: string,
) {
  const favoritedStudentKeys = new Set(
    favoritedStudents.map(({ contentId, studentId }) => `${contentId}:${studentId}`),
  );

  return contents
    .flatMap((content) => {
      if (
        content.kind !== "event" ||
        !isInstantAfter(content.until, now) ||
        (content.recruitmentGroupUid !== null && completedRecruitmentGroupUids.has(content.recruitmentGroupUid))
      ) {
        return [];
      }

      const favoritedRecruitments = content.recruitments.filter(
        ({ pickup, recruitmentType, student }) =>
          pickup && recruitmentType !== "given" && student && favoritedStudentKeys.has(`${content.uid}:${student.uid}`),
      );
      if (favoritedRecruitments.length === 0) {
        return [];
      }

      return [
        {
          uid: content.uid,
          since: content.since,
          until: content.until,
          students: favoritedRecruitments.flatMap(({ student }) =>
            student ? [{ uid: student.uid, name: student.name }] : [],
          ),
        },
      ];
    })
    .sort((a, b) => getInstantTime(a.until) - getInstantTime(b.until));
}

function getRecruitmentScheduleLabel(since: string, until: string, now: string): string {
  if (!isInstantAfter(since, now) && isInstantAfter(until, now)) {
    return "진행중";
  }

  return `D-${Math.max(0, Math.ceil((getInstantTime(since) - getInstantTime(now)) / 86_400_000))}`;
}

function buildPyroxeneEventDataMap(
  eventData: PyroxeneEventData[],
  contents: MorePyroxeneContent[],
  recruitmentResults: Awaited<ReturnType<typeof getRecruitmentResultsByRecruitmentGroupUids>>,
) {
  const map = new Map<string, { completed: boolean; expectedTrials: number | null }>();
  for (const data of eventData) {
    map.set(data.eventUid, {
      completed: false,
      expectedTrials: data.expectedTrials,
    });
  }

  const contentByRecruitmentGroupUid = new Map(
    contents.flatMap((content) =>
      content.kind === "event" && content.recruitmentGroupUid ? [[content.recruitmentGroupUid, content]] : [],
    ),
  );
  for (const result of recruitmentResults) {
    if (!result.completedAt) {
      continue;
    }
    const content = contentByRecruitmentGroupUid.get(result.recruitmentGroupUid);
    if (!content) {
      continue;
    }
    const existing = map.get(content.uid);
    map.set(content.uid, {
      completed: true,
      expectedTrials: existing?.expectedTrials ?? null,
    });
  }

  return map;
}

function buildPyroxeneScheduleItems(
  contents: MorePyroxeneContent[],
  favoritedStudents: MoreFavoritedStudent[],
  timelineItems: PyroxeneTimelineItem[],
): PyroxeneScheduleItem[] {
  const favoritedStudentKeys = new Set(
    favoritedStudents.map(({ contentId, studentId }) => `${contentId}:${studentId}`),
  );
  const items: PyroxeneScheduleItem[] = contents.map((content) => {
    if (content.kind === "event") {
      return {
        event: {
          uid: content.uid,
          name: content.name,
          since: content.since,
          until: content.until,
          earnablePyroxene: content.earnablePyroxene ?? null,
          tags: content.tags,
          recruitmentPool: content.recruitmentPool,
          recruitments: content.recruitments.map((recruitment) => ({
            ...recruitment,
            favorited:
              recruitment.student !== null && favoritedStudentKeys.has(`${content.uid}:${recruitment.student.uid}`),
          })),
        },
      };
    }

    return {
      raid: {
        uid: content.uid,
        name: content.name,
        type: content.type,
        since: content.since,
        until: content.until,
      },
    };
  });

  for (const item of timelineItems) {
    appendTimelineScheduleItem(items, item);
  }

  return items;
}

function appendTimelineScheduleItem(items: PyroxeneScheduleItem[], item: PyroxeneTimelineItem) {
  if (item.source === "buy") {
    if (item.repeatType === "monthly_first") {
      items.push({
        repeatedGain: {
          uid: item.uid,
          source: "buy",
          description: item.description,
          date: new Date(item.eventAt),
          pyroxeneDelta: item.pyroxeneDelta,
          repeatType: item.repeatType,
          repeatCount: item.repeatCount ?? undefined,
        },
      });
      return;
    }

    items.push({
      onetimeGain: {
        uid: item.uid,
        source: "buy",
        description: item.description,
        date: new Date(item.eventAt),
        pyroxeneDelta: item.pyroxeneDelta,
      },
    });
    return;
  }

  if (item.source === "package_onetime" || item.source === "package_ap") {
    if (item.autoRepurchase && item.repeatIntervalDays) {
      items.push({
        repeatedGain: {
          uid: item.uid,
          source: item.source,
          description: item.description,
          date: new Date(item.eventAt),
          pyroxeneDelta: item.pyroxeneDelta,
          repeatType: item.repeatType,
          repeatIntervalDays: item.repeatIntervalDays,
          repeatCount: item.repeatCount ?? undefined,
          autoRepurchase: item.autoRepurchase,
        },
      });
      return;
    }

    items.push({
      onetimeGain: {
        uid: item.uid,
        source: item.source,
        description: item.description,
        date: new Date(item.eventAt),
        pyroxeneDelta: item.pyroxeneDelta,
        autoRepurchase: item.autoRepurchase,
      },
    });
    return;
  }

  if (item.source === "package_daily") {
    items.push({
      repeatedGain: {
        uid: item.uid,
        source: "package_daily",
        description: item.description,
        date: new Date(item.eventAt),
        pyroxeneDelta: item.pyroxeneDelta,
        repeatType: item.repeatType,
        repeatIntervalDays: item.repeatIntervalDays ?? 0,
        repeatCount: item.repeatCount ?? undefined,
        autoRepurchase: item.autoRepurchase,
      },
    });
    return;
  }

  if (item.source === "attendance") {
    items.push({
      repeatedGain: {
        uid: item.uid,
        source: "attendance",
        description: item.description,
        date: new Date(item.eventAt),
        pyroxeneDelta: item.pyroxeneDelta,
        repeatType: item.repeatType,
        repeatIntervalDays: item.repeatIntervalDays ?? 0,
      },
    });
    return;
  }

  items.push({
    onetimeGain: {
      uid: item.uid,
      source: item.source,
      description: item.description,
      date: new Date(item.eventAt),
      pyroxeneDelta: item.pyroxeneDelta,
      oneTimeTicketDelta: item.oneTimeTicketDelta,
      tenTimeTicketDelta: item.tenTimeTicketDelta,
    },
  });
}
