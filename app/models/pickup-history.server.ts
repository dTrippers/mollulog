import {
  createPostgresPickupHistory,
  deletePostgresPickupHistory,
  getPostgresPickupHistories,
  getPostgresPickupHistory,
  updatePostgresPickupHistory,
} from "~/db/postgres/pickup-history";
import type { PickupHistory } from "~/models/pickup-history";

export async function getPickupHistory(
  env: Env,
  userId: number,
  uid: string,
  includeRaw?: boolean,
): Promise<PickupHistory | null> {
  return getPostgresPickupHistory(env, userId, uid, includeRaw);
}

export async function getPickupHistories(env: Env, userId: number): Promise<PickupHistory[]> {
  return getPostgresPickupHistories(env, userId);
}

export async function createPickupHistory(
  env: Env,
  userId: number,
  eventId: string,
  result: PickupHistory["result"],
  rawResult: string | null,
) {
  await createPostgresPickupHistory(env, userId, eventId, result, rawResult);
}

export async function updatePickupHistory(
  env: Env,
  userId: number,
  uid: string,
  eventId: string,
  result: PickupHistory["result"],
  rawResult?: string | null,
) {
  await updatePostgresPickupHistory(env, userId, uid, eventId, result, rawResult);
}

export async function deletePickupHistory(env: Env, userId: number, uid: string) {
  await deletePostgresPickupHistory(env, userId, uid);
}
