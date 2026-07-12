import { and, count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Sensei } from "./sensei";
import { getSenseisById } from "./sensei";

const followershipsTable = sqliteTable("followerships", {
  id: int().primaryKey({ autoIncrement: true }),
  followerId: int().notNull(),
  followeeId: int().notNull(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

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

export async function follow(env: Env, followerId: number, followeeId: number) {
  const db = drizzle(env.DB);
  await db.insert(followershipsTable).values({ followerId, followeeId }).run();
}

export async function unfollow(env: Env, followerId: number, followeeId: number) {
  const db = drizzle(env.DB);
  await db
    .delete(followershipsTable)
    .where(and(eq(followershipsTable.followerId, followerId), eq(followershipsTable.followeeId, followeeId)))
    .run();
}

export async function getFollowershipSummary(
  env: Env,
  userId: number,
  viewerId?: number,
): Promise<FollowershipSummary> {
  const db = drizzle(env.DB);
  const followerCountQuery = db
    .select({ count: count() })
    .from(followershipsTable)
    .where(eq(followershipsTable.followeeId, userId));
  const followingCountQuery = db
    .select({ count: count() })
    .from(followershipsTable)
    .where(eq(followershipsTable.followerId, userId));

  if (viewerId === undefined) {
    const [followerRows, followingRows] = await db.batch([followerCountQuery, followingCountQuery]);
    return {
      followerCount: followerRows[0].count,
      followingCount: followingRows[0].count,
      followed: false,
      following: false,
    };
  }

  const [followerRows, followingRows, followedRows, followingRelationshipRows] = await db.batch([
    followerCountQuery,
    followingCountQuery,
    db
      .select({ id: followershipsTable.id })
      .from(followershipsTable)
      .where(and(eq(followershipsTable.followerId, userId), eq(followershipsTable.followeeId, viewerId)))
      .limit(1),
    db
      .select({ id: followershipsTable.id })
      .from(followershipsTable)
      .where(and(eq(followershipsTable.followerId, viewerId), eq(followershipsTable.followeeId, userId)))
      .limit(1),
  ]);

  return {
    followerCount: followerRows[0].count,
    followingCount: followingRows[0].count,
    followed: followedRows.length > 0,
    following: followingRelationshipRows.length > 0,
  };
}

export async function getFollowerIds(env: Env, followeeId: number): Promise<number[]> {
  const db = drizzle(env.DB);
  const result = await db
    .select({ followerId: followershipsTable.followerId })
    .from(followershipsTable)
    .where(eq(followershipsTable.followeeId, followeeId));
  return result.map((each) => each.followerId);
}

export async function getFollowers(env: Env, followeeId: number): Promise<Sensei[]> {
  return getSenseisById(env, await getFollowerIds(env, followeeId));
}

export async function getFollowingIds(env: Env, followerId: number): Promise<number[]> {
  const db = drizzle(env.DB);
  const result = await db
    .select({ followeeId: followershipsTable.followeeId })
    .from(followershipsTable)
    .where(eq(followershipsTable.followerId, followerId));
  return result.map((each) => each.followeeId);
}

export async function getFollowings(env: Env, followerId: number): Promise<Sensei[]> {
  return getSenseisById(env, await getFollowingIds(env, followerId));
}
