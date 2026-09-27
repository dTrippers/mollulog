import { type ActionFunctionArgs, data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { createDefaultEventShopState, type EventShopState } from "~/domain/event-shop-state";
import { buildEventShopStateIdentity } from "~/domain/event-shop-state-key";
import { getEventMetadata, getEventShopContent } from "~/models/event-content";
import { getEventShopStates } from "~/models/event-shop-state";
import { getRecruitedStudents } from "~/models/recruited-student";

type RequestedEvent = {
  timelineUid: string;
  shopStateUid: string;
};

export type EventShopStateLookupRow =
  | {
      timelineUid: string;
      shopStateUid: string;
      status: "available";
      eventName: string;
      state: EventShopState | null;
      defaultState: EventShopState | null;
      displayCatalog: EventShopPlanDisplayCatalog | null;
    }
  | {
      timelineUid: string;
      shopStateUid: string;
      status: "unavailable";
      eventName?: string;
    };

export type EventShopStateLookupResponse = {
  success: boolean;
  error?: string;
  requestId?: string;
  states: EventShopStateLookupRow[];
};

export type EventShopPlanDisplayCatalog = {
  shopItemNamesByUid: Record<string, string>;
  resourceNamesByUid: Record<string, string>;
  bonusResourceNamesByUid: Record<string, string>;
  stageLabelsByUid: Record<string, string>;
  sweepStageUids: string[];
  studentNamesByUid: Record<string, string>;
  hasMinigame: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUid(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512;
}

function parseRequestedEvents(value: unknown): RequestedEvent[] | null {
  if (!isRecord(value) || !Array.isArray(value.events) || value.events.length > 500) return null;
  const events: RequestedEvent[] = [];
  for (const item of value.events) {
    if (!isRecord(item) || !isUid(item.timelineUid) || !isUid(item.shopStateUid)) return null;
    events.push({ timelineUid: item.timelineUid, shopStateUid: item.shopStateUid });
  }
  return events;
}

function addName(target: Record<string, string>, uid: string, name: string | null | undefined) {
  const normalizedName = name?.trim();
  if (normalizedName && target[uid] === undefined) target[uid] = normalizedName;
}

function getEventShopPlanDisplayCatalog(
  content: NonNullable<Awaited<ReturnType<typeof getEventShopContent>>>,
): EventShopPlanDisplayCatalog {
  const shopItemNamesByUid: Record<string, string> = {};
  const resourceNamesByUid: Record<string, string> = {};
  const bonusResourceNamesByUid: Record<string, string> = {};
  const stageLabelsByUid: Record<string, string> = {};
  const studentNamesByUid: Record<string, string> = {};

  for (const resource of content.shopResources) {
    addName(shopItemNamesByUid, resource.uid, resource.resource.name);
    addName(resourceNamesByUid, resource.resource.uid, resource.resource.name);
    addName(resourceNamesByUid, resource.paymentResource.uid, resource.paymentResource.name);
    for (const tier of resource.purchaseTiers) {
      addName(resourceNamesByUid, tier.paymentResource.uid, tier.paymentResource.name);
    }
  }

  for (const stage of content.stages) {
    const kind = stage.difficulty === 0 ? "스토리" : stage.difficulty === 1 ? "퀘스트" : "챌린지";
    stageLabelsByUid[stage.uid] = stage.index.trim() ? `${kind} ${stage.index}` : `${kind} 스테이지`;
    for (const reward of stage.rewards) {
      if (reward.item) addName(resourceNamesByUid, reward.item.uid, reward.item.name);
    }
  }

  for (const bonus of content.eventRewardBonus) {
    addName(bonusResourceNamesByUid, bonus.uid, bonus.name);
    addName(resourceNamesByUid, bonus.uid, bonus.name);
    for (const { student } of bonus.rewardBonuses) {
      addName(studentNamesByUid, student.uid, student.name);
    }
  }

  const minigame = content.minigameConfig;
  if (minigame) {
    const payments = [
      minigame.payment,
      ...minigame.payments,
      ...minigame.rewardGroups.flatMap((group) => group.payments),
    ];
    for (const payment of payments) {
      addName(resourceNamesByUid, payment.resourceUid, payment.resourceName);
    }
    for (const reward of minigame.rewardGroups.flatMap((group) => group.rewards)) {
      addName(resourceNamesByUid, reward.resourceUid, reward.resourceName);
    }
  }

  return {
    shopItemNamesByUid,
    resourceNamesByUid,
    bonusResourceNamesByUid,
    stageLabelsByUid,
    sweepStageUids: content.stages.filter(({ difficulty }) => difficulty === 1).map(({ uid }) => uid),
    studentNamesByUid,
    hasMinigame: minigame !== null,
  };
}

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return data<EventShopStateLookupResponse>(
      { success: false, error: "요청 내용을 읽지 못했어요", states: [] },
      { status: 400 },
    );
  }
  const requestId =
    isRecord(body) && typeof body.requestId === "string" && body.requestId.length <= 128 ? body.requestId : undefined;
  const user = await getActiveSensei(env, request);
  if (!user) {
    return data<EventShopStateLookupResponse>(
      { success: false, error: "로그인이 필요해요", ...(requestId ? { requestId } : {}), states: [] },
      { status: 401 },
    );
  }
  const events = parseRequestedEvents(body);
  if (!events) {
    return data<EventShopStateLookupResponse>(
      { success: false, error: "상점 계획 요청을 확인해주세요", ...(requestId ? { requestId } : {}), states: [] },
      { status: 400 },
    );
  }

  let recruitedStudentUids: string[] | null = null;
  if (events.length > 0) {
    try {
      recruitedStudentUids = (await getRecruitedStudents(env, user.id)).map(({ studentUid }) => studentUid);
    } catch {
      recruitedStudentUids = null;
    }
  }

  const identities = await Promise.all(
    events.map(async (event) => {
      try {
        const metadata = await getEventMetadata(env, event.timelineUid, ctx);
        if (!metadata) return { event, status: "unavailable" as const };
        const identity = buildEventShopStateIdentity({
          timelineUid: event.timelineUid,
          shopContentUid: metadata.shopContentUid,
        });
        if (identity.shopStateUid !== event.shopStateUid) return { event, status: "unavailable" as const };
        let displayCatalog: EventShopPlanDisplayCatalog | null = null;
        let defaultState: EventShopState | null = null;
        try {
          const shopContent = await getEventShopContent(env, event.timelineUid, false, ctx);
          if (shopContent) {
            displayCatalog = getEventShopPlanDisplayCatalog(shopContent);
            if (recruitedStudentUids !== null) {
              defaultState = createDefaultEventShopState(shopContent.stages, recruitedStudentUids);
            }
          }
        } catch {
          displayCatalog = null;
          defaultState = null;
        }
        return {
          event,
          status: "available" as const,
          eventName: metadata.name,
          identity,
          displayCatalog,
          defaultState,
        };
      } catch {
        return { event, status: "unavailable" as const };
      }
    }),
  );

  const validIdentities = identities.filter((item) => item.status === "available");
  const accountUids = [
    ...new Set(
      validIdentities.flatMap(({ identity }) =>
        identity.fallbackStateUid ? [identity.shopStateUid, identity.fallbackStateUid] : [identity.shopStateUid],
      ),
    ),
  ];
  let accountStates: Record<string, EventShopState> = {};
  if (accountUids.length > 0) {
    try {
      accountStates = await getEventShopStates(env, user.id, accountUids, { ctx });
    } catch {
      return {
        success: true,
        ...(requestId ? { requestId } : {}),
        states: identities.map((item) => ({
          timelineUid: item.event.timelineUid,
          shopStateUid: item.event.shopStateUid,
          status: "unavailable" as const,
          ...(item.status === "available" ? { eventName: item.eventName } : {}),
        })),
      } satisfies EventShopStateLookupResponse;
    }
  }

  const states = identities.map((item): EventShopStateLookupRow => {
    if (item.status === "unavailable") {
      return {
        timelineUid: item.event.timelineUid,
        shopStateUid: item.event.shopStateUid,
        status: "unavailable",
      };
    }
    const state =
      accountStates[item.identity.shopStateUid] ??
      (item.identity.fallbackStateUid ? (accountStates[item.identity.fallbackStateUid] ?? null) : null);
    return {
      timelineUid: item.event.timelineUid,
      shopStateUid: item.identity.shopStateUid,
      status: "available",
      eventName: item.eventName,
      state,
      defaultState: item.defaultState,
      displayCatalog: item.displayCatalog,
    };
  });

  return { success: true, ...(requestId ? { requestId } : {}), states } satisfies EventShopStateLookupResponse;
};
