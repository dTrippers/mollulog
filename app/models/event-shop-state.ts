import {
  type PostgresEventShopStateOptions,
  type PostgresEventShopStatePatchOptions,
  type PostgresEventShopStateUpsertOptions,
  patchPostgresEventShopStateOwnedQuantities,
  upsertPostgresEventShopState,
} from "~/db/postgres/event-shop-state";
import type { EventShopOwnedQuantityPatch, EventShopState } from "~/domain/event-shop-state";
import { getEventShopPlannerState, getEventShopPlannerStates } from "~/models/planner-state";

export type { EventShopOwnedQuantityPatch, EventShopState } from "~/domain/event-shop-state";

export async function getEventShopState(env: Env, userId: number, eventUid: string): Promise<EventShopState | null> {
  return getEventShopPlannerState(env, userId, eventUid);
}

export async function getEventShopStates(
  env: Env,
  userId: number,
  eventUids: readonly string[],
  options: PostgresEventShopStateOptions = {},
): Promise<Record<string, EventShopState>> {
  return getEventShopPlannerStates(env, userId, eventUids, options);
}

export async function upsertEventShopState(
  env: Env,
  userId: number,
  eventUid: string,
  state: EventShopState,
  options: PostgresEventShopStateUpsertOptions = {},
): Promise<void> {
  await upsertPostgresEventShopState(env, userId, eventUid, state, options);
}

export async function patchEventShopStateOwnedQuantities(
  env: Env,
  userId: number,
  eventUid: string,
  patch: EventShopOwnedQuantityPatch,
  defaultState: EventShopState,
  options: PostgresEventShopStatePatchOptions = {},
): Promise<void> {
  await patchPostgresEventShopStateOwnedQuantities(env, userId, eventUid, patch, defaultState, options);
}
