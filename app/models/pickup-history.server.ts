import { getPostgresPickupHistory } from "~/db/postgres/pickup-history";
import type { PickupHistory } from "~/models/pickup-history";

export async function getPickupHistory(
  env: Env,
  userId: number,
  uid: string,
  includeRaw?: boolean,
): Promise<PickupHistory | null> {
  return getPostgresPickupHistory(env, userId, uid, includeRaw);
}
