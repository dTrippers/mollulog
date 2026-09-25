import type { EventShopState } from "~/domain/event-shop-state";
import { buildEventShopStateIdentity } from "~/domain/event-shop-state-key";
import type { PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import type { ShopAvailableEvent } from "~/models/event-content";
import {
  getEventContentSchedule,
  getEventMetadata,
  getEventShopContent,
  getShopAvailableEvents,
} from "~/models/event-content";
import { getEventShopStates } from "~/models/event-shop-state";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import type { PyroxeneEventData, PyroxeneTimelineItem } from "~/models/pyroxene-planner";
import { getPyroxeneUserState } from "~/models/pyroxene-planner";
import { getRecruitedStudents } from "~/models/recruited-student";
import type { RecruitmentGroup } from "~/models/recruitment";
import { getRecruitmentGroupsByUids } from "~/models/recruitment";
import { getRecruitmentResultsByRecruitmentGroupUids } from "~/models/recruitment-result.server";
import type { TimelineContent } from "~/models/timeline-content.server";
import { getTimelineContentDatesByContentUid, getTimelineContents } from "~/models/timeline-content.server";
import type { PyroxenePlannerContent } from "~/views/pyroxene";
import { getPyroxenePlannerContents } from "~/views/pyroxene";

type SourceStatus = "available" | "unavailable";

export type IntegratedPlannerRecruitmentGroup = Pick<RecruitmentGroup, "uid" | "startAt" | "endAt">;

export type IntegratedPlannerAccountState = {
  latestResources: {
    pyroxene: number;
    oneTimeTicket: number;
    tenTimeTicket: number;
    inputAt: string | null;
  };
  timelineItems: PyroxeneTimelineItem[];
  options: PyroxenePlannerOptions;
  eventData: PyroxeneEventData[];
  collectedSourceKeys: string[];
  favoritedStudents: { contentUid: string; studentUid: string }[];
  recruitedStudentUids: string[] | null;
  recruitmentCompletions: { eventUid: string; recruitmentGroupUid: string }[];
};

type EventShopContent = NonNullable<Awaited<ReturnType<typeof getEventShopContent>>>;

type ExplicitShopDates = {
  startAt: string | null;
  endAt: string | null;
};

function resolveExplicitShopDates(
  shopSchedule: Awaited<ReturnType<typeof getEventContentSchedule>>,
  canonicalShopDates: Awaited<ReturnType<typeof getTimelineContentDatesByContentUid>>,
): ExplicitShopDates {
  if (shopSchedule?.startAt && shopSchedule.endAt) {
    return { startAt: shopSchedule.startAt, endAt: shopSchedule.endAt };
  }
  if (canonicalShopDates?.startAt && canonicalShopDates.endAt) {
    return { startAt: canonicalShopDates.startAt, endAt: canonicalShopDates.endAt };
  }
  return { startAt: null, endAt: null };
}

export type IntegratedPlannerShopEvent = {
  status: SourceStatus;
  timelineUid: string;
  name: string;
  shopStateUid: string | null;
  startAt: string | null;
  endAt: string | null;
  content: EventShopContent | null;
  accountState: EventShopState | null;
  accountStateStatus: SourceStatus;
};

export type IntegratedPlannerTimelineEvent = Pick<
  TimelineContent,
  "uid" | "name" | "startAt" | "endAt" | "endless" | "imageUrl" | "runType" | "contentType" | "tags"
>;

export type IntegratedPlannerData = {
  pyroxeneSchedules: PyroxenePlannerContent[];
  pyroxeneSchedulesStatus: SourceStatus;
  timelineEvents: IntegratedPlannerTimelineEvent[];
  timelineEventsStatus: SourceStatus;
  recruitmentGroups: IntegratedPlannerRecruitmentGroup[];
  recruitmentGroupsStatus: SourceStatus;
  accountState: IntegratedPlannerAccountState | null;
  accountStateStatus: SourceStatus;
  shopEvents: IntegratedPlannerShopEvent[];
  shopEventsStatus: SourceStatus;
};

export async function getIntegratedPlannerData(
  env: Env,
  userId: number | null,
  ctx?: ExecutionContext,
): Promise<IntegratedPlannerData> {
  const [pyroxeneSchedulesResult, timelineEventsResult, shopAvailableEventsResult] = await Promise.allSettled([
    getPyroxenePlannerContents(env, false, ctx),
    getTimelineContents(env, undefined, { ctx }),
    getShopAvailableEvents(env, ctx),
  ]);

  const pyroxeneSchedules = pyroxeneSchedulesResult.status === "fulfilled" ? pyroxeneSchedulesResult.value : [];
  const pyroxeneSchedulesStatus: SourceStatus =
    pyroxeneSchedulesResult.status === "fulfilled" ? "available" : "unavailable";
  const timelineEventsStatus: SourceStatus = timelineEventsResult.status === "fulfilled" ? "available" : "unavailable";
  const timelineEvents: IntegratedPlannerTimelineEvent[] =
    timelineEventsResult.status === "fulfilled"
      ? timelineEventsResult.value
          .filter(
            (content) =>
              content.contentType === "event" ||
              content.contentType === "main_story" ||
              content.contentType === "pickup",
          )
          .map(({ uid, name, startAt, endAt, endless, imageUrl, runType, contentType, tags }) => ({
            uid,
            name,
            startAt,
            endAt,
            endless,
            imageUrl,
            runType,
            contentType,
            tags,
          }))
      : [];

  let recruitmentGroups: IntegratedPlannerRecruitmentGroup[] = [];
  let recruitmentGroupsStatus: SourceStatus = "available";
  if (pyroxeneSchedulesStatus === "available") {
    const recruitmentGroupUids = [
      ...new Set(
        pyroxeneSchedules.flatMap((content) =>
          content.kind === "event" && content.recruitmentGroupUid && content.recruitments.length > 0
            ? [content.recruitmentGroupUid]
            : [],
        ),
      ),
    ];
    try {
      const groups = await getRecruitmentGroupsByUids(env, recruitmentGroupUids, false);
      recruitmentGroups = groups.map(({ uid, startAt, endAt }) => ({ uid, startAt, endAt }));
    } catch {
      recruitmentGroupsStatus = "unavailable";
    }
  } else {
    recruitmentGroupsStatus = "unavailable";
  }

  const [accountStateResult, shopEventsResult] = await Promise.all([
    userId === null ? Promise.resolve(null) : loadAccountState(env, userId, pyroxeneSchedules, ctx),
    shopAvailableEventsResult.status === "fulfilled"
      ? loadShopEvents(env, shopAvailableEventsResult.value, userId, ctx)
      : Promise.resolve(null),
  ]);

  return {
    pyroxeneSchedules,
    pyroxeneSchedulesStatus,
    timelineEvents,
    timelineEventsStatus,
    recruitmentGroups,
    recruitmentGroupsStatus,
    accountState: accountStateResult?.state ?? null,
    accountStateStatus: userId === null ? "available" : (accountStateResult?.status ?? "unavailable"),
    shopEvents: shopEventsResult?.events ?? [],
    shopEventsStatus:
      shopAvailableEventsResult.status === "fulfilled" && shopEventsResult ? "available" : "unavailable",
  };
}

async function loadAccountState(
  env: Env,
  userId: number,
  schedules: PyroxenePlannerContent[],
  ctx?: ExecutionContext,
): Promise<{ status: SourceStatus; state: IntegratedPlannerAccountState | null }> {
  try {
    const groupUids = schedules.flatMap((content) =>
      content.kind === "event" && content.recruitmentGroupUid ? [content.recruitmentGroupUid] : [],
    );
    const [pyroxeneState, favorites, recruitmentResults, recruitedStudents] = await Promise.all([
      getPyroxeneUserState(env, userId, { ctx }),
      getUserFavoritedStudents(env, userId, undefined, { ctx }),
      getRecruitmentResultsByRecruitmentGroupUids(env, userId, groupUids),
      getRecruitedStudents(env, userId).catch(() => null),
    ]);
    const recruitmentCompletions = recruitmentResults.flatMap((result) => {
      if (!result.completedAt) return [];
      const content = schedules.find(
        (item) => item.kind === "event" && item.recruitmentGroupUid === result.recruitmentGroupUid,
      );
      return content?.kind === "event"
        ? [{ eventUid: content.uid, recruitmentGroupUid: result.recruitmentGroupUid }]
        : [];
    });

    return {
      status: "available",
      state: {
        latestResources: {
          pyroxene: pyroxeneState.latestResources?.pyroxene ?? 0,
          oneTimeTicket: pyroxeneState.latestResources?.oneTimeTicket ?? 0,
          tenTimeTicket: pyroxeneState.latestResources?.tenTimeTicket ?? 0,
          inputAt: pyroxeneState.latestResources?.inputAt ?? null,
        },
        timelineItems: pyroxeneState.timelineItems,
        options: pyroxeneState.options ?? defaultPyroxenePlannerOptions,
        eventData: pyroxeneState.eventData,
        collectedSourceKeys: [...pyroxeneState.collectedSourceKeys],
        favoritedStudents: favorites.map(({ contentId, studentId }) => ({
          contentUid: contentId,
          studentUid: studentId,
        })),
        recruitedStudentUids: recruitedStudents?.map(({ studentUid }) => studentUid) ?? null,
        recruitmentCompletions,
      },
    };
  } catch {
    return { status: "unavailable", state: null };
  }
}

async function loadShopEvents(
  env: Env,
  events: ShopAvailableEvent[],
  userId: number | null,
  ctx?: ExecutionContext,
): Promise<{ events: IntegratedPlannerShopEvent[] }> {
  const resolvedEvents = await Promise.all(
    events.map(async (event) => {
      try {
        const metadata = await getEventMetadata(env, event.uid, ctx);
        if (!metadata) return { event, identity: null, startAt: null, endAt: null, content: null };

        const content = await getEventShopContent(env, event.uid, false, ctx);
        if (!content || content.shopResources.length === 0) {
          return { event, identity: null, startAt: null, endAt: null, content: null };
        }

        const canonicalShopDates = metadata.shopContentUid
          ? await getTimelineContentDatesByContentUid(env, metadata.shopContentUid, { ctx })
          : null;
        const shopSchedule = metadata.shopContentUid
          ? await getEventContentSchedule(env, metadata.shopContentUid, metadata.runType)
          : null;
        const { startAt, endAt } = resolveExplicitShopDates(shopSchedule, canonicalShopDates);
        const identity = buildEventShopStateIdentity({
          timelineUid: event.uid,
          shopContentUid: metadata.shopContentUid,
        });

        return { event, identity, startAt, endAt, content };
      } catch {
        return { event, identity: null, startAt: null, endAt: null, content: null };
      }
    }),
  );

  const accountStateUids =
    userId === null
      ? []
      : [
          ...new Set(
            resolvedEvents.flatMap(({ identity }) =>
              identity
                ? [identity.shopStateUid, ...(identity.fallbackStateUid ? [identity.fallbackStateUid] : [])]
                : [],
            ),
          ),
        ];
  let accountStates: Record<string, EventShopState> = {};
  let accountStateReadFailed = false;
  if (userId !== null && accountStateUids.length > 0) {
    try {
      accountStates = await getEventShopStates(env, userId, accountStateUids, { ctx });
    } catch {
      accountStateReadFailed = true;
    }
  }

  return {
    events: resolvedEvents.map(({ event, identity, startAt, endAt, content }) => {
      if (!identity || !content) return unavailableShopEvent(event);

      const accountStateStatus: SourceStatus = userId !== null && accountStateReadFailed ? "unavailable" : "available";
      const accountState =
        userId === null || accountStateReadFailed
          ? null
          : (accountStates[identity.shopStateUid] ??
            (identity.fallbackStateUid ? (accountStates[identity.fallbackStateUid] ?? null) : null));

      return {
        status: "available",
        timelineUid: event.uid,
        name: event.name,
        shopStateUid: identity.shopStateUid,
        startAt,
        endAt,
        content,
        accountState,
        accountStateStatus,
      };
    }),
  };
}

function unavailableShopEvent(event: ShopAvailableEvent): IntegratedPlannerShopEvent {
  return {
    status: "unavailable",
    timelineUid: event.uid,
    name: event.name,
    shopStateUid: null,
    startAt: null,
    endAt: null,
    content: null,
    accountState: null,
    accountStateStatus: "unavailable",
  };
}
