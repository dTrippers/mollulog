import { buildPyroxeneScheduleItems } from "~/domain/pyroxene-schedule";
import { getPyroxeneGameDayStartAt, isPyroxeneOneOffGainSource } from "~/domain/pyroxene-sources";
import { buildTimeline, type PickupResources, type PyroxeneTimelineEventData } from "~/domain/pyroxene-timeline";
import { isRecordedRecruitmentResult } from "~/domain/recruitment-result";
import { getInstantTime, isInstantAfter, nowUtcIso } from "~/lib/date-time";
import { sanitizeErrorForLogging } from "~/lib/privacy-scrub";
import { countUnregisteredActiveCoupons } from "~/models/coupon";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { getPyroxeneUserState, type PyroxeneEventData } from "~/models/pyroxene-planner";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getRecruitmentResults, getRecruitmentResultsByRecruitmentGroupUids } from "~/models/recruitment-result.server";
import { getRelationshipLevels } from "~/models/relationship-level";
import type { Sensei } from "~/models/sensei";
import { getAllStudentsMap } from "~/models/student";
import { getPyroxenePlannerContents } from "~/views/pyroxene";

// The signed-in account. It comes from the session, so it shows even when the summary below fails to load.
export type MoreAccount = {
  username: string;
  profileStudentId: string | null;
};

// The account's numbers and plans. Null when it fails to load: the screen then shows a failure in the account block
// instead of zeros, and the menus keep working.
export type MoreSummary = {
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
      // Null when the student is missing from the student list, so the image has no name to read.
      name: string | null;
      currentLevel: number | null;
    }[];
  };
};

export type MoreViewData = {
  account: MoreAccount | null;
  summary: MoreSummary | null;
};

// The menus and the bottom-tab pinning read the navigation data that the root loader already provides, so this loader
// reads only the account summary.
export async function getMoreViewData(env: Env, ctx: ExecutionContext, sensei: Sensei | null): Promise<MoreViewData> {
  if (!sensei) {
    return { account: null, summary: null };
  }
  const account = { username: sensei.username, profileStudentId: sensei.profileStudentId };
  try {
    const rows = await getMorePersonalSummaryRows(env, sensei.id, ctx);
    return { account, summary: buildSummary(rows) };
  } catch (error) {
    console.error("Failed to load the more screen's account summary.", sanitizeErrorForLogging(error));
    return { account, summary: null };
  }
}

type MorePersonalSummaryRows = Awaited<ReturnType<typeof getMorePersonalSummaryRows>>;

function getMorePersonalSummaryRows(env: Env, senseiId: number, ctx?: ExecutionContext) {
  const pyroxeneContentsPromise = getPyroxenePlannerContents(env, false, ctx);
  const recruitmentResultsPromise = pyroxeneContentsPromise.then((pyroxeneContents) => {
    const recruitmentGroupUids = pyroxeneContents.flatMap((content) =>
      content.kind === "event" && content.recruitmentGroupUid ? [content.recruitmentGroupUid] : [],
    );
    return getRecruitmentResultsByRecruitmentGroupUids(env, senseiId, recruitmentGroupUids);
  });

  return Promise.all([
    getRecruitedStudents(env, senseiId),
    getRecruitmentResults(env, senseiId),
    getPyroxeneUserState(env, senseiId, { ctx }),
    pyroxeneContentsPromise,
    getUserFavoritedStudents(env, senseiId, undefined, { ctx }),
    getRelationshipLevels(env, senseiId),
    countUnregisteredActiveCoupons(env, senseiId, { ctx }),
    recruitmentResultsPromise,
    getAllStudentsMap(env),
  ]);
}

function buildSummary(rows: MorePersonalSummaryRows): MoreSummary {
  const now = nowUtcIso();
  const [
    recruitedStudents,
    allRecruitmentResults,
    pyroxeneState,
    pyroxeneContents,
    favoritedStudents,
    relationshipLevels,
    availableCouponCount,
    recruitmentResults,
    studentsByUid,
  ] = rows;
  const latestPyroxeneResources = pyroxeneState.latestResources;
  const pyroxeneOptions = pyroxeneState.options;
  const pyroxeneEventData = pyroxeneState.eventData;
  const pyroxeneTimelineItems = pyroxeneState.timelineItems;
  const collectedSourceKeys = pyroxeneState.collectedSourceKeys;
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
          latestPyroxeneResources.recruitmentStacks,
        )
      : [];
  const nextPyroxeneTimelineEntry = nextFavoritedRecruitment
    ? (pyroxeneTimeline.find(
        ({ source }) => source.type === "event" && source.event?.uid === nextFavoritedRecruitment.uid,
      ) ?? null)
    : null;
  const savedRelationships = relationshipLevels.filter(
    ({ currentLevel, targetLevel, items }) =>
      currentLevel != null || targetLevel != null || Object.values(items).some((quantity) => quantity > 0),
  );
  const relationshipTargets = savedRelationships
    .filter(
      ({ currentLevel, targetLevel }) => targetLevel != null && (currentLevel == null || targetLevel > currentLevel),
    )
    .sort((a, b) => (b.currentLevel ?? 0) - (a.currentLevel ?? 0) || (b.targetLevel ?? 0) - (a.targetLevel ?? 0));
  const relationshipTargetStudents = relationshipTargets.slice(0, 3).map(({ studentId, currentLevel }) => ({
    uid: studentId,
    name: studentsByUid[studentId]?.name ?? null,
    currentLevel,
  }));

  return {
    recruitedStudentCount: recruitedStudents.length,
    pickupHistoryCount: allRecruitmentResults.filter(isRecordedRecruitmentResult).length,
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
      savedCount: savedRelationships.length,
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
type MorePyroxeneTimelineItem = Awaited<ReturnType<typeof getPyroxeneUserState>>["timelineItems"][number];
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
  // A purchase or direct gain recorded on its own game day applies from the start of that day (see buildTimeline).
  return timelineItems.filter(
    (item) =>
      getInstantTime(
        isPyroxeneOneOffGainSource(item.source) ? getPyroxeneGameDayStartAt(item.eventAt) : item.eventAt,
      ) <= recruitmentSinceTime,
  );
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
  const map = new Map<string, PyroxeneTimelineEventData>();
  for (const data of eventData) {
    map.set(data.eventUid, {
      completed: false,
      expectedTrials: data.expectedTrials,
      pickupChance: data.pickupChance,
      targetTiers: data.targetTiers,
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
      ...existing,
      completed: true,
      expectedTrials: existing?.expectedTrials ?? null,
    });
  }

  return map;
}
