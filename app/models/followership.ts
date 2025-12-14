import type { Sensei } from "./sensei";
import { getSenseisById } from "./sensei";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { and, count, eq, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

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
}

export type Relationship = {
  followed: boolean;
  following: boolean;
};

export async function follow(env: Env, followerId: number, followeeId: number) {
  const db = drizzle(env.DB);
  await db.insert(followershipsTable).values({ followerId, followeeId }).run();
}

export async function unfollow(env: Env, followerId: number, followeeId: number) {
  const db = drizzle(env.DB);
  await db.delete(followershipsTable).where(
    and(eq(followershipsTable.followerId, followerId), eq(followershipsTable.followeeId, followeeId)),
  ).run();
}

export async function getFollowershipCount(env: Env, userId: number): Promise<{ followers: number, followings: number }> {
  const db = drizzle(env.DB);
  const result = await db.select({
    followers: count(followershipsTable.followerId),
    followings: count(followershipsTable.followeeId),
  }).from(followershipsTable).where(or(eq(followershipsTable.followerId, userId), eq(followershipsTable.followeeId, userId)));

  return {
    followers: result[0].followers,
    followings: result[0].followings,
  };
}

export async function getFollowerIds(env: Env, followeeId: number): Promise<number[]> {
  const db = drizzle(env.DB);
  const result = await db.select().from(followershipsTable).where(eq(followershipsTable.followeeId, followeeId));
  return result.map((each) => each.followerId);
}

export async function getFollowers(env: Env, followeeId: number): Promise<Sensei[]> {
  return getSenseisById(env, await getFollowerIds(env, followeeId));
}

export async function getFollowingIds(env: Env, followerId: number): Promise<number[]> {
  const db = drizzle(env.DB);
  const result = await db.select().from(followershipsTable).where(eq(followershipsTable.followerId, followerId));
  return result.map((each) => each.followeeId);
}

export async function getFollowings(env: Env, followerId: number): Promise<Sensei[]> {
  return getSenseisById(env, await getFollowingIds(env, followerId));
}
