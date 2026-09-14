import { nanoid } from "nanoid/non-secure";
import {
  type EventShopOwnedQuantityPatch,
  type EventShopState,
  eventShopStatesEqual,
  normalizeEventShopState,
  patchEventShopOwnedQuantities,
} from "~/domain/event-shop-state";

export const GUEST_EVENT_SHOP_PLANNER_VERSION = 1 as const;
export const GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY = "mollulog::guest-event-shop-planner::v1";

export type GuestEventShopPlan = {
  timelineUid: string;
  shopStateUid: string;
  state: EventShopState;
};

export type AccountEventShopPlanLookup =
  | { status: "available"; state: EventShopState | null }
  | { status: "unavailable" };

export type GuestEventShopPlanComparison = {
  plan: GuestEventShopPlan;
  status: "identical" | "guest-only" | "different" | "unavailable";
  accountState?: EventShopState;
};

export type EventShopDefaultsByShopStateUid = Readonly<Record<string, EventShopState | undefined>>;

export type GuestEventShopPlannerData = {
  plans: Record<string, GuestEventShopPlan>;
};

export type GuestEventShopPlannerEnvelope = {
  version: typeof GUEST_EVENT_SHOP_PLANNER_VERSION;
  datasetId: string;
  revision: number;
  updatedAt: string;
  data: GuestEventShopPlannerData;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function normalizePlan(value: unknown, key: string): GuestEventShopPlan | null {
  if (!isRecord(value) || !isStableId(value.timelineUid) || !isStableId(value.shopStateUid)) return null;
  if (key !== value.shopStateUid) return null;
  const state = normalizeEventShopState(value.state);
  return state ? { timelineUid: value.timelineUid, shopStateUid: value.shopStateUid, state } : null;
}

export function createEmptyGuestEventShopPlanner(): GuestEventShopPlannerEnvelope {
  return {
    version: GUEST_EVENT_SHOP_PLANNER_VERSION,
    datasetId: nanoid(16),
    revision: 0,
    updatedAt: new Date().toISOString(),
    data: { plans: {} },
  };
}

export function normalizeGuestEventShopPlanner(value: unknown): GuestEventShopPlannerEnvelope | null {
  if (!isRecord(value) || value.version !== GUEST_EVENT_SHOP_PLANNER_VERSION) return null;
  if (
    !isStableId(value.datasetId) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    !isRecord(value.data) ||
    !isRecord(value.data.plans)
  ) {
    return null;
  }

  const plans: Record<string, GuestEventShopPlan> = {};
  for (const [key, planValue] of Object.entries(value.data.plans)) {
    if (!isStableId(key)) return null;
    const plan = normalizePlan(planValue, key);
    if (!plan) return null;
    plans[key] = plan;
  }

  return {
    version: GUEST_EVENT_SHOP_PLANNER_VERSION,
    datasetId: value.datasetId,
    revision: value.revision as number,
    updatedAt: value.updatedAt,
    data: { plans },
  };
}

export function parseGuestEventShopPlanner(value: string): GuestEventShopPlannerEnvelope | null {
  try {
    return normalizeGuestEventShopPlanner(JSON.parse(value));
  } catch {
    return null;
  }
}

export function hasGuestEventShopPlannerData(data: GuestEventShopPlannerData): boolean {
  return Object.keys(data.plans).length > 0;
}

export function upsertGuestEventShopPlan(
  data: GuestEventShopPlannerData,
  input: GuestEventShopPlan,
): GuestEventShopPlannerData {
  const state = normalizeEventShopState(input.state);
  if (!state || !isStableId(input.timelineUid) || !isStableId(input.shopStateUid)) {
    throw new Error("이벤트 상점 계획을 저장할 수 없어요");
  }
  return {
    ...data,
    plans: {
      ...data.plans,
      [input.shopStateUid]: {
        timelineUid: input.timelineUid,
        shopStateUid: input.shopStateUid,
        state,
      },
    },
  };
}

export function patchGuestEventShopPlanOwnedQuantities(
  data: GuestEventShopPlannerData,
  input: Pick<GuestEventShopPlan, "timelineUid" | "shopStateUid"> & {
    defaults: EventShopState;
    patch: EventShopOwnedQuantityPatch;
  },
): GuestEventShopPlannerData {
  const current = data.plans[input.shopStateUid];
  const base = current?.state ?? input.defaults;
  return upsertGuestEventShopPlan(data, {
    timelineUid: input.timelineUid,
    shopStateUid: input.shopStateUid,
    state: patchEventShopOwnedQuantities(base, input.patch),
  });
}

export function guestEventShopPlansEqual(left: unknown, right: unknown): boolean {
  if (!isRecord(left) || !isRecord(right)) return false;
  return (
    left.shopStateUid === right.shopStateUid &&
    typeof left.shopStateUid === "string" &&
    eventShopStatesEqual(left.state, right.state)
  );
}

export function isDefaultEventShopState(state: unknown, defaultState: EventShopState | null | undefined): boolean {
  return defaultState !== null && defaultState !== undefined && eventShopStatesEqual(state, defaultState);
}

export function filterDefaultGuestEventShopPlans(
  guestPlans: readonly GuestEventShopPlan[],
  defaultsByShopStateUid: EventShopDefaultsByShopStateUid,
): GuestEventShopPlan[] {
  return guestPlans.filter((plan) => !isDefaultEventShopState(plan.state, defaultsByShopStateUid[plan.shopStateUid]));
}

export function compareGuestEventShopPlans(
  guestPlans: readonly GuestEventShopPlan[],
  accountStatesByShopStateUid: Readonly<Record<string, AccountEventShopPlanLookup | undefined>>,
  defaultsByShopStateUid?: EventShopDefaultsByShopStateUid,
): GuestEventShopPlanComparison[] {
  const seenShopStateUids = new Set<string>();
  return (defaultsByShopStateUid ? filterDefaultGuestEventShopPlans(guestPlans, defaultsByShopStateUid) : guestPlans)
    .filter((plan) => {
      if (seenShopStateUids.has(plan.shopStateUid)) return false;
      seenShopStateUids.add(plan.shopStateUid);
      return true;
    })
    .map((plan) => {
      const defaultState = defaultsByShopStateUid?.[plan.shopStateUid];
      if (defaultsByShopStateUid && !defaultState) return { plan, status: "unavailable" };
      const account = accountStatesByShopStateUid[plan.shopStateUid];
      if (!account || account.status === "unavailable") return { plan, status: "unavailable" };
      const accountState = isDefaultEventShopState(account.state, defaultState) ? null : account.state;
      if (!accountState) return { plan, status: "guest-only" };
      if (eventShopStatesEqual(plan.state, accountState)) return { plan, status: "identical", accountState };
      return { plan, status: "different", accountState };
    });
}

export function countUnresolvedGuestEventShopPlans(
  guestPlans: readonly GuestEventShopPlan[],
  accountStatesByShopStateUid: Readonly<Record<string, AccountEventShopPlanLookup | undefined>>,
  defaultsByShopStateUid?: EventShopDefaultsByShopStateUid,
): number {
  return compareGuestEventShopPlans(guestPlans, accountStatesByShopStateUid, defaultsByShopStateUid).filter(
    ({ status }) => status !== "identical",
  ).length;
}

export function removeGuestEventShopPlanIfUnchanged(
  data: GuestEventShopPlannerData,
  expected: GuestEventShopPlan,
): GuestEventShopPlannerData {
  const current = data.plans[expected.shopStateUid];
  if (!current || current.timelineUid !== expected.timelineUid || !guestEventShopPlansEqual(current, expected)) {
    return data;
  }
  const plans = { ...data.plans };
  delete plans[expected.shopStateUid];
  return { ...data, plans };
}
