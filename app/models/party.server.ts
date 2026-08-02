import {
  deletePostgresCommunityPostByUid,
  getPostgresPartiesByRaidReference,
  getPostgresUserParties,
} from "~/db/postgres/community";
import type { Party } from "./party";

export type { Party } from "./party";

export async function getUserParties(
  env: Env,
  username: string,
  { includePrivate = false }: { includePrivate?: boolean } = {},
): Promise<Party[]> {
  return getPostgresUserParties(env, username, includePrivate);
}

export async function getPartiesByRaidReference(
  env: Env,
  raidType: string,
  seasonIndex: number,
  includeSensei = false,
): Promise<Party[]> {
  return getPostgresPartiesByRaidReference(env, raidType, seasonIndex, includeSensei);
}

export async function removePartyByUid(env: Env, userId: number, uid: string): Promise<void> {
  return deletePostgresCommunityPostByUid(env, uid, userId);
}
