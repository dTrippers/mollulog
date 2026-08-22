import { and, count, eq } from "drizzle-orm";
import { withIdentityDatabase } from "~/db/postgres/identity";
import { pgFollowershipsTable } from "~/db/postgres/schema";
import type { Sensei } from "./sensei";
import { getVisibleSenseisById } from "./sensei";

export const followershipsTable = pgFollowershipsTable;

export type Followership = {
  followerId: number;
  followeeId: number;
};

export type Relationship = {
  followed: boolean;
  following: boolean;
};

export type FollowershipSummary = Relationship & {
  followerCount: number;
  followingCount: number;
};

export async function follow(env: Env, followerId: number, followeeId: number): Promise<void> {
  await withIdentityDatabase(env, "follow", async (db) => {
    await db
      .insert(pgFollowershipsTable)
      .values({ followerId, followeeId })
      .onConflictDoNothing({
        target: [pgFollowershipsTable.followerId, pgFollowershipsTable.followeeId],
      });
  });
}

export async function unfollow(env: Env, followerId: number, followeeId: number): Promise<void> {
  await withIdentityDatabase(env, "unfollow", async (db) => {
    await db
      .delete(pgFollowershipsTable)
      .where(and(eq(pgFollowershipsTable.followerId, followerId), eq(pgFollowershipsTable.followeeId, followeeId)));
  });
}

export async function getFollowershipSummary(
  env: Env,
  userId: number,
  viewerId?: number,
): Promise<FollowershipSummary> {
  return withIdentityDatabase(env, "followership_summary", async (db) => {
    const followerCountQuery = db
      .select({ count: count() })
      .from(pgFollowershipsTable)
      .where(eq(pgFollowershipsTable.followeeId, userId));
    const followingCountQuery = db
      .select({ count: count() })
      .from(pgFollowershipsTable)
      .where(eq(pgFollowershipsTable.followerId, userId));

    const [followerRows, followingRows] = await Promise.all([followerCountQuery, followingCountQuery]);
    if (viewerId === undefined) {
      return {
        followerCount: Number(followerRows[0]?.count ?? 0),
        followingCount: Number(followingRows[0]?.count ?? 0),
        followed: false,
        following: false,
      };
    }

    const [followedRows, followingRelationshipRows] = await Promise.all([
      db
        .select({ id: pgFollowershipsTable.id })
        .from(pgFollowershipsTable)
        .where(and(eq(pgFollowershipsTable.followerId, userId), eq(pgFollowershipsTable.followeeId, viewerId)))
        .limit(1),
      db
        .select({ id: pgFollowershipsTable.id })
        .from(pgFollowershipsTable)
        .where(and(eq(pgFollowershipsTable.followerId, viewerId), eq(pgFollowershipsTable.followeeId, userId)))
        .limit(1),
    ]);

    return {
      followerCount: Number(followerRows[0]?.count ?? 0),
      followingCount: Number(followingRows[0]?.count ?? 0),
      followed: followedRows.length > 0,
      following: followingRelationshipRows.length > 0,
    };
  });
}

export async function getFollowerIds(env: Env, followeeId: number): Promise<number[]> {
  return withIdentityDatabase(env, "follower_ids", async (db) => {
    const rows = await db
      .select({ followerId: pgFollowershipsTable.followerId })
      .from(pgFollowershipsTable)
      .where(eq(pgFollowershipsTable.followeeId, followeeId));
    return rows.map((row) => row.followerId);
  });
}

export async function getFollowers(env: Env, followeeId: number, viewerId?: number): Promise<Sensei[]> {
  return getVisibleSenseisById(env, await getFollowerIds(env, followeeId), viewerId);
}

export async function getFollowingIds(env: Env, followerId: number): Promise<number[]> {
  return withIdentityDatabase(env, "following_ids", async (db) => {
    const rows = await db
      .select({ followeeId: pgFollowershipsTable.followeeId })
      .from(pgFollowershipsTable)
      .where(eq(pgFollowershipsTable.followerId, followerId));
    return rows.map((row) => row.followeeId);
  });
}

export async function getFollowings(env: Env, followerId: number, viewerId?: number): Promise<Sensei[]> {
  return getVisibleSenseisById(env, await getFollowingIds(env, followerId), viewerId);
}
