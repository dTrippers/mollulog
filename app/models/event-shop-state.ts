import {
  getPostgresEventShopState,
  getPostgresEventShopStates,
  type PostgresEventShopStateOptions,
  patchPostgresEventShopStateOwnedQuantities,
  upsertPostgresEventShopState,
} from "~/db/postgres/event-shop-state";
import type { EventShopOwnedQuantityPatch, EventShopState } from "~/domain/event-shop-state";

export type { EventShopOwnedQuantityPatch, EventShopState } from "~/domain/event-shop-state";

export async function getEventShopState(env: Env, userId: number, eventUid: string): Promise<EventShopState | null> {
  return getPostgresEventShopState(env, userId, eventUid);
}

export async function getEventShopStates(
  env: Env,
  userId: number,
  eventUids: readonly string[],
  options: PostgresEventShopStateOptions = {},
): Promise<Record<string, EventShopState>> {
  return getPostgresEventShopStates(env, userId, eventUids, options);
}

export async function upsertEventShopState(
  env: Env,
  userId: number,
  eventUid: string,
  state: EventShopState,
): Promise<void> {
  await upsertPostgresEventShopState(env, userId, eventUid, state);
}

export async function patchEventShopStateOwnedQuantities(
  env: Env,
  userId: number,
  eventUid: string,
  patch: EventShopOwnedQuantityPatch,
  defaultState: EventShopState,
  options: PostgresEventShopStateOptions = {},
): Promise<void> {
  await patchPostgresEventShopStateOwnedQuantities(env, userId, eventUid, patch, defaultState, options);
}
