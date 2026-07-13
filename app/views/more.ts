import { buildPyroxeneScheduleItems } from "~/domain/pyroxene-schedule";
import { buildTimeline, type PickupResources } from "~/domain/pyroxene-timeline";
import { getInstantTime, isInstantAfter, nowUtcIso } from "~/lib/date-time";
import { countUnregisteredActiveCoupons } from "~/models/coupon";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { getPickupHistories } from "~/models/pickup-history";
import {
  getAllPyroxeneEventData,
  getCollectedSourceKeys,
  getLatestPyroxeneOwnedResource,
  getPyroxenePlannerOptions,
  getPyroxeneTimelineItems,
  type PyroxeneEventData,
} from "~/models/pyroxene-planner";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getRecruitmentResultsByRecruitmentGroupUids } from "~/models/recruitment-result";
import { getRelationshipLevels } from "~/models/relationship-level";
import type { Sensei } from "~/models/sensei";
import { withD1Session } from "~/lib/d1-session";
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
    expectedTicketTrialCount: number | null;
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
  const publicReadEnv = withD1Session(env, "first-unconstrained");
  const [navigationBarContents, personalSummary] = await Promise.all([
    getNavigationBarContents(env, false, undefined, ctx, publicReadEnv),
    sensei ? getMorePersonalSummary(env, sensei.id, ctx, publicReadEnv) : Promise.resolve(null),
  ]);
  const currentUser = sensei && personalSummary ? buildCurrentUserSummary(sensei, personalSummary) : null;

  return {
    currentUser,
    upcomingEvent: navigationBarContents.upcomingEvent,
    hasRecentNews: navigationBarContents.hasRecentNews,
    hasUnconsumedCoupons: currentUser
      ? currentUser.availableCouponCount > 0
      : navigationBarContents.hasUnconsumedCoupons,
    hasUnreadFeedbackReplies: navigationBarContents.hasUnreadFeedbackReplies,
  };
}

type MorePersonalSummary = Awaited<ReturnType<typeof getMorePersonalSummary>>;

function getMorePersonalSummary(env: Env, senseiId: number, ctx?: ExecutionContext, publicReadEnv: Env = env) {
  const pyroxeneContentsPromise = getPyroxenePlannerContents(publicReadEnv, false, ctx);
  const recruitmentResultsPromise = pyroxeneContentsPromise.then((pyroxeneContents) => {
    const recruitmentGroupUids = pyroxeneContents.flatMap((content) =>
      content.kind === "event" && content.recruitmentGroupUid ? [content.recruitmentGroupUid] : [],
    );
    return getRecruitmentResultsByRecruitmentGroupUids(env, senseiId, recruitmentGroupUids);
  });

  return Promise.all([
    getRecruitedStudents(env, senseiId),
    getPickupHistories(env, senseiId),
    getLatestPyroxeneOwnedResource(env, senseiId),
    pyroxeneContentsPromise,
    getUserFavoritedStudents(env, senseiId),
    getPyroxenePlannerOptions(env, senseiId),
    getAllPyroxeneEventData(env, senseiId),
    getPyroxeneTimelineItems(env, senseiId),
    getCollectedSourceKeys(env, senseiId),
    getRelationshipLevels(env, senseiId),
    countUnregisteredActiveCoupons(env, senseiId),
    recruitmentResultsPromise,
  ]);
}

function buildCurrentUserSummary(sensei: Sensei, personalSummary: MorePersonalSummary): MoreCurrentUser {
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
    availableCouponCount,
    recruitmentResults,
  ] = personalSummary;
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
  const pyroxeneTimelineContents = nextFavoritedRecruitment
    ? getPyroxeneContentsUntilRecruitment(pyroxeneContents, nextFavoritedRecruitment)
    : [];
  const pyroxeneTimelineItemsUntilRecruitment = nextFavoritedRecruitment
    ? getPyroxeneTimelineItemsUntilRecruitment(pyroxeneTimelineItems, nextFavoritedRecruitment)
    : [];
  const pyroxeneTimeline =
    latestPyroxeneResources && nextFavoritedRecruitment
      ? buildTimeline(
          {
            pyroxene: latestPyroxeneResources.pyroxene,
            oneTimeTicket: latestPyroxeneResources.oneTimeTicket,
            tenTimeTicket: latestPyroxeneResources.tenTimeTicket,
          },
          new Date(latestPyroxeneResources.inputAt),
          buildPyroxeneEventDataMap(pyroxeneEventData, pyroxeneTimelineContents, recruitmentResults),
          buildPyroxeneScheduleItems(
            pyroxeneTimelineContents,
            favoritedStudents.map(({ contentId, studentId }) => ({ contentUid: contentId, studentUid: studentId })),
            pyroxeneTimelineItemsUntilRecruitment,
          ),
          pyroxeneOptions,
          undefined,
          [...collectedSourceKeys],
          new Date(nextFavoritedRecruitment.since),
        )
      : [];
  const nextPyroxeneTimelineEntry = nextFavoritedRecruitment
    ? (pyroxeneTimeline.find(
        ({ source }) => source.type === "event" && source.event?.uid === nextFavoritedRecruitment.uid,
      ) ?? null)
    : null;
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
    availableCouponCount,
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
          expectedPyroxene: nextPyroxeneTimelineEntry
            ? nextPyroxeneTimelineEntry.accumulatedResources.pyroxene - nextPyroxeneTimelineEntry.resourceDelta.pyroxene
            : null,
          expectedTicketTrialCount: nextPyroxeneTimelineEntry
            ? getTicketTrialCountBeforeTimelineEntry(nextPyroxeneTimelineEntry)
            : null,
        }
      : null,
    relationship: {
      savedCount: relationshipLevels.length,
      targetStudentCount: relationshipTargets.length,
      targetStudents: relationshipTargetStudents,
    },
  };
}

function getTicketTrialCountBeforeTimelineEntry(entry: {
  accumulatedResources: PickupResources;
  resourceDelta: PickupResources;
}) {
  const oneTimeTicket = entry.accumulatedResources.oneTimeTicket - entry.resourceDelta.oneTimeTicket;
  const tenTimeTicket = entry.accumulatedResources.tenTimeTicket - entry.resourceDelta.tenTimeTicket;
  return oneTimeTicket + tenTimeTicket * 10;
}

type MorePyroxeneContent = Awaited<ReturnType<typeof getPyroxenePlannerContents>>[number];
type MoreFavoritedStudent = Awaited<ReturnType<typeof getUserFavoritedStudents>>[number];
type MorePyroxeneTimelineItem = Awaited<ReturnType<typeof getPyroxeneTimelineItems>>[number];
type MoreFavoritedRecruitment = {
  uid: string;
  since: string;
  until: string;
};

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
        ({ pickup, recruitmentType, student, sourceContentUid }) =>
          pickup &&
          recruitmentType !== "given" &&
          student &&
          favoritedStudentKeys.has(`${sourceContentUid ?? content.uid}:${student.uid}`),
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

function getPyroxeneContentsUntilRecruitment(contents: MorePyroxeneContent[], recruitment: MoreFavoritedRecruitment) {
  const recruitmentSinceTime = getInstantTime(recruitment.since);
  return contents.filter(
    (content) => content.uid === recruitment.uid || getInstantTime(content.since) <= recruitmentSinceTime,
  );
}

function getPyroxeneTimelineItemsUntilRecruitment(
  timelineItems: MorePyroxeneTimelineItem[],
  recruitment: MoreFavoritedRecruitment,
) {
  const recruitmentSinceTime = getInstantTime(recruitment.since);
  return timelineItems.filter((item) => getInstantTime(item.eventAt) <= recruitmentSinceTime);
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

  // A recruitment group can be split into a recruitments-empty "reward only" entry per event
  // plus one merged entry carrying the actual recruitments (see getPyroxenePlannerContents).
  // Prefer the merged entry here so "completed" status lands on the content that actually
  // renders the pickup students, regardless of which entry appears last in `contents`.
  const contentByRecruitmentGroupUid = new Map<string, MorePyroxeneContent>();
  for (const content of contents) {
    if (content.kind !== "event" || !content.recruitmentGroupUid) {
      continue;
    }
    const existing = contentByRecruitmentGroupUid.get(content.recruitmentGroupUid);
    if (!existing || content.recruitments.length > 0) {
      contentByRecruitmentGroupUid.set(content.recruitmentGroupUid, content);
    }
  }
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
