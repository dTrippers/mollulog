import {
  deletePostgresCommunityPostByUid,
  getPostgresPartiesByRaidReference,
  getPostgresUserParties,
} from "~/db/postgres/community";
import { resolveCommunitySourceMode } from "./community.server";
import {
  getPartiesByRaidReference as getD1PartiesByRaidReference,
  getUserParties as getD1UserParties,
  type Party,
  removePartyByUid as removeD1PartyByUid,
} from "./party";

export type { DBParty, Party } from "./party";

function isPostgresCommunityMode(env: Pick<Env, "COMMUNITY_SOURCE_MODE">): boolean {
  return resolveCommunitySourceMode(env.COMMUNITY_SOURCE_MODE) === "hyperdrive";
}

export async function getUserParties(
  env: Env,
  username: string,
  { includePrivate = false }: { includePrivate?: boolean } = {},
): Promise<Party[]> {
  return isPostgresCommunityMode(env)
    ? getPostgresUserParties(env, username, includePrivate)
    : getD1UserParties(env, username, { includePrivate });
}

export async function getPartiesByRaidReference(
  env: Env,
  raidType: string,
  seasonIndex: number,
  includeSensei = false,
): Promise<Party[]> {
  return isPostgresCommunityMode(env)
    ? getPostgresPartiesByRaidReference(env, raidType, seasonIndex, includeSensei)
    : getD1PartiesByRaidReference(env, raidType, seasonIndex, includeSensei);
}

export async function removePartyByUid(env: Env, userId: number, uid: string): Promise<void> {
  return isPostgresCommunityMode(env)
    ? deletePostgresCommunityPostByUid(env, uid, userId)
    : removeD1PartyByUid(env, userId, uid);
}
