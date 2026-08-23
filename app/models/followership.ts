import { and, count, eq } from "drizzle-orm";
import { type IdentityRepositoryOptions, withIdentityDatabase } from "~/db/postgres/identity";
import { pgFollowershipsTable, pgSenseisTable } from "~/db/postgres/schema";
import { type Sensei, senseiProfileVisibilityFilter, toSenseiModel } from "./sensei";

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

export async function follow(
  env: Env,
  followerId: number,
  followeeId: number,
  options: IdentityRepositoryOptions = {},
): Promise<void> {
  await withIdentityDatabase(
    env,
    "follow",
    async (db) => {
      await db
        .insert(pgFollowershipsTable)
        .values({ followerId, followeeId })
        .onConflictDoNothing({
          target: [pgFollowershipsTable.followerId, pgFollowershipsTable.followeeId],
        });
    },
    options,
  );
}

export async function unfollow(
  env: Env,
  followerId: number,
  followeeId: number,
  options: IdentityRepositoryOptions = {},
): Promise<void> {
  await withIdentityDatabase(
    env,
    "unfollow",
    async (db) => {
      await db
        .delete(pgFollowershipsTable)
        .where(and(eq(pgFollowershipsTable.followerId, followerId), eq(pgFollowershipsTable.followeeId, followeeId)));
    },
    options,
  );
}

export async function getFollowershipSummary(
  env: Env,
  userId: number,
  viewerId?: number,
  options: IdentityRepositoryOptions = {},
): Promise<FollowershipSummary> {
  return withIdentityDatabase(
    env,
    "followership_summary",
    async (db) => {
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
    },
    options,
  );
}

export async function getFollowerIds(
  env: Env,
  followeeId: number,
  options: IdentityRepositoryOptions = {},
): Promise<number[]> {
  return withIdentityDatabase(
    env,
    "follower_ids",
    async (db) => {
      const rows = await db
        .select({ followerId: pgFollowershipsTable.followerId })
        .from(pgFollowershipsTable)
        .where(eq(pgFollowershipsTable.followeeId, followeeId));
      return rows.map((row) => row.followerId);
    },
    options,
  );
}

export async function getFollowers(
  env: Env,
  followeeId: number,
  viewerId?: number,
  options: IdentityRepositoryOptions = {},
): Promise<Sensei[]> {
  return getSenseisForRelationship(env, "followers", followeeId, viewerId, options);
}

export async function getFollowingIds(
  env: Env,
  followerId: number,
  options: IdentityRepositoryOptions = {},
): Promise<number[]> {
  return withIdentityDatabase(
    env,
    "following_ids",
    async (db) => {
      const rows = await db
        .select({ followeeId: pgFollowershipsTable.followeeId })
        .from(pgFollowershipsTable)
        .where(eq(pgFollowershipsTable.followerId, followerId));
      return rows.map((row) => row.followeeId);
    },
    options,
  );
}

export async function getFollowings(
  env: Env,
  followerId: number,
  viewerId?: number,
  options: IdentityRepositoryOptions = {},
): Promise<Sensei[]> {
  return getSenseisForRelationship(env, "following", followerId, viewerId, options);
}

type FollowershipLists = {
  following: Sensei[];
  followers: Sensei[];
};

/** Loads both visible relationship lists on one operation-scoped connection. */
export async function getFollowershipLists(
  env: Env,
  userId: number,
  viewerId?: number,
  options: IdentityRepositoryOptions = {},
): Promise<FollowershipLists> {
  return withIdentityDatabase(
    env,
    "followership_lists",
    async (db) => {
      const followingQuery = db
        .select({ sensei: pgSenseisTable })
        .from(pgFollowershipsTable)
        .innerJoin(pgSenseisTable, eq(pgFollowershipsTable.followeeId, pgSenseisTable.id))
        .where(
          and(eq(pgFollowershipsTable.followerId, userId), senseiProfileVisibilityFilter(viewerId, pgSenseisTable.id)),
        );
      const followersQuery = db
        .select({ sensei: pgSenseisTable })
        .from(pgFollowershipsTable)
        .innerJoin(pgSenseisTable, eq(pgFollowershipsTable.followerId, pgSenseisTable.id))
        .where(
          and(eq(pgFollowershipsTable.followeeId, userId), senseiProfileVisibilityFilter(viewerId, pgSenseisTable.id)),
        );
      const [followingRows, followerRows] = await Promise.all([followingQuery, followersQuery]);
      return {
        following: followingRows.map(({ sensei }) => toSenseiModel(sensei)),
        followers: followerRows.map(({ sensei }) => toSenseiModel(sensei)),
      };
    },
    options,
  );
}

async function getSenseisForRelationship(
  env: Env,
  relationship: "followers" | "following",
  userId: number,
  viewerId: number | undefined,
  options: IdentityRepositoryOptions,
): Promise<Sensei[]> {
  return withIdentityDatabase(
    env,
    relationship === "followers" ? "followers" : "followings",
    async (db) => {
      const senseiIdColumn =
        relationship === "followers" ? pgFollowershipsTable.followerId : pgFollowershipsTable.followeeId;
      const relationshipColumn =
        relationship === "followers" ? pgFollowershipsTable.followeeId : pgFollowershipsTable.followerId;
      const rows = await db
        .select({ sensei: pgSenseisTable })
        .from(pgFollowershipsTable)
        .innerJoin(pgSenseisTable, eq(senseiIdColumn, pgSenseisTable.id))
        .where(and(eq(relationshipColumn, userId), senseiProfileVisibilityFilter(viewerId, pgSenseisTable.id)));
      return rows.map(({ sensei }) => toSenseiModel(sensei));
    },
    options,
  );
}
