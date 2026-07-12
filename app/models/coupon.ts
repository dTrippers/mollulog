import { and, eq, gt, isNull, notExists, or, sql } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";

export const couponsTable = sqliteTable("coupons", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  name: text().notNull(),
  code: text().notNull(),
  imageUrl: text(),
  rewards: text().notNull().default("[]"),
  linkUrl: text(),
  linkLabel: text(),
  expiresAt: text(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export const couponRegistrationsTable = sqliteTable("coupon_registrations", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  couponId: int().notNull(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export type CouponReward = { itemUid: string; quantity: number };

export type Coupon = {
  id: number;
  uid: string;
  name: string;
  code: string;
  imageUrl: string | null;
  rewards: CouponReward[];
  linkUrl: string | null;
  linkLabel: string | null;
  expiresAt: string | null;
};

function toModel(row: typeof couponsTable.$inferSelect): Coupon {
  return {
    id: row.id,
    uid: row.uid,
    name: row.name,
    code: row.code,
    imageUrl: row.imageUrl,
    rewards: JSON.parse(row.rewards) as CouponReward[],
    linkUrl: row.linkUrl,
    linkLabel: row.linkLabel,
    expiresAt: row.expiresAt,
  };
}

export async function getAllCoupons(env: Env): Promise<Coupon[]> {
  const db = drizzle(env.DB);
  const rows = await db
    .select()
    .from(couponsTable)
    .orderBy(
      sql`CASE WHEN ${couponsTable.expiresAt} IS NULL THEN 1 ELSE 0 END, ${couponsTable.expiresAt} DESC, ${couponsTable.createdAt} DESC`,
    );
  return rows.map(toModel);
}

export async function hasActiveCoupons(env: Env): Promise<boolean> {
  const db = drizzle(env.DB);
  const nowIso = new Date().toISOString();
  const rows = await db
    .select({ id: couponsTable.id })
    .from(couponsTable)
    .where(or(isNull(couponsTable.expiresAt), gt(couponsTable.expiresAt, nowIso)))
    .limit(1);
  return rows.length > 0;
}

export function buildUnregisteredActiveCouponsQuery(
  db: DrizzleD1Database,
  userId: number,
  nowIso = new Date().toISOString(),
) {
  return db
    .select({ id: couponsTable.id })
    .from(couponsTable)
    .where(
      and(
        or(isNull(couponsTable.expiresAt), gt(couponsTable.expiresAt, nowIso)),
        notExists(
          db
            .select({ id: couponRegistrationsTable.id })
            .from(couponRegistrationsTable)
            .where(
              and(eq(couponRegistrationsTable.userId, userId), eq(couponRegistrationsTable.couponId, couponsTable.id)),
            ),
        ),
      ),
    )
    .limit(1);
}

export async function hasUnregisteredActiveCoupons(env: Env, userId: number): Promise<boolean> {
  const rows = await buildUnregisteredActiveCouponsQuery(drizzle(env.DB), userId);
  return rows.length > 0;
}

export async function countUnregisteredActiveCoupons(env: Env, userId: number): Promise<number> {
  const db = drizzle(env.DB);
  const nowIso = new Date().toISOString();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(couponsTable)
    .where(
      and(
        or(isNull(couponsTable.expiresAt), gt(couponsTable.expiresAt, nowIso)),
        sql`not exists (
          select 1
          from ${couponRegistrationsTable}
          where ${couponRegistrationsTable.userId} = ${userId}
            and ${couponRegistrationsTable.couponId} = ${couponsTable.id}
        )`,
      ),
    );
  return Number(row?.count ?? 0);
}

export async function getCouponRegistrations(env: Env, userId: number): Promise<number[]> {
  const db = drizzle(env.DB);
  const rows = await db
    .select({ couponId: couponRegistrationsTable.couponId })
    .from(couponRegistrationsTable)
    .where(eq(couponRegistrationsTable.userId, userId));
  return rows.map((r) => r.couponId);
}

export async function registerCoupon(env: Env, userId: number, couponId: number): Promise<void> {
  const db = drizzle(env.DB);
  const uid = nanoid(8);
  await db.insert(couponRegistrationsTable).values({ uid, userId, couponId }).onConflictDoNothing();
}

export async function unregisterCoupon(env: Env, userId: number, couponId: number): Promise<void> {
  const db = drizzle(env.DB);
  await db
    .delete(couponRegistrationsTable)
    .where(and(eq(couponRegistrationsTable.userId, userId), eq(couponRegistrationsTable.couponId, couponId)));
}
