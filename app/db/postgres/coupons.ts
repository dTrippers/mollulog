import { and, asc, count, desc, eq, gt, isNull, notExists, or, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgCouponRegistrationsTable, pgCouponsTable } from "~/db/postgres/schema";
import type { CouponReward } from "~/domain/coupon";
import { normalizeInstant, type UtcIsoString } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

type PostgresCouponRow = typeof pgCouponsTable.$inferSelect;

export type Coupon = {
  id: number;
  uid: string;
  name: string;
  code: string;
  imageUrl: string | null;
  rewards: CouponReward[];
  linkUrl: string | null;
  linkLabel: string | null;
  expiresAt: UtcIsoString | null;
};

export type PostgresCouponOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

function toUtcIso(value: Date | string): UtcIsoString {
  return normalizeInstant(value instanceof Date ? value.toISOString() : value);
}

function toCoupon(row: PostgresCouponRow): Coupon {
  return {
    id: row.id,
    uid: row.uid,
    name: row.name,
    code: row.code,
    imageUrl: row.imageUrl,
    rewards: row.rewards,
    linkUrl: row.linkUrl,
    linkLabel: row.linkLabel,
    expiresAt: row.expiresAt ? toUtcIso(row.expiresAt) : null,
  };
}

async function withCouponDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (db: NodePgDatabase) => Promise<T>,
  options: PostgresCouponOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.collection.name", "coupons");
        span?.setAttribute("coupon.query_name", queryName);
        return operation(drizzle(client));
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.coupons.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

export async function getPostgresCoupons(
  env: Pick<Env, "HYPERDRIVE">,
  options: PostgresCouponOptions = {},
): Promise<Coupon[]> {
  return withCouponDatabase(
    env,
    "get_all",
    async (db) => {
      const rows = await db
        .select()
        .from(pgCouponsTable)
        .orderBy(
          asc(sql`case when ${pgCouponsTable.expiresAt} is null then 1 else 0 end`),
          desc(pgCouponsTable.expiresAt),
          desc(pgCouponsTable.createdAt),
        );
      return rows.map(toCoupon);
    },
    options,
  );
}

export async function hasPostgresActiveCoupons(
  env: Pick<Env, "HYPERDRIVE">,
  options: PostgresCouponOptions = {},
): Promise<boolean> {
  return withCouponDatabase(
    env,
    "has_active",
    async (db) => {
      const rows = await db
        .select({ id: pgCouponsTable.id })
        .from(pgCouponsTable)
        .where(or(isNull(pgCouponsTable.expiresAt), gt(pgCouponsTable.expiresAt, new Date())))
        .limit(1);
      return rows.length > 0;
    },
    options,
  );
}

export async function hasPostgresUnregisteredActiveCoupons(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresCouponOptions = {},
): Promise<boolean> {
  return withCouponDatabase(
    env,
    "has_unregistered_active",
    async (db) => {
      const rows = await db
        .select({ id: pgCouponsTable.id })
        .from(pgCouponsTable)
        .where(
          and(
            or(isNull(pgCouponsTable.expiresAt), gt(pgCouponsTable.expiresAt, new Date())),
            notExists(
              db
                .select({ id: pgCouponRegistrationsTable.id })
                .from(pgCouponRegistrationsTable)
                .where(
                  and(
                    eq(pgCouponRegistrationsTable.userId, userId),
                    eq(pgCouponRegistrationsTable.couponId, pgCouponsTable.id),
                  ),
                ),
            ),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
    options,
  );
}

export async function countPostgresUnregisteredActiveCoupons(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresCouponOptions = {},
): Promise<number> {
  return withCouponDatabase(
    env,
    "count_unregistered_active",
    async (db) => {
      const [row] = await db
        .select({ value: count() })
        .from(pgCouponsTable)
        .where(
          and(
            or(isNull(pgCouponsTable.expiresAt), gt(pgCouponsTable.expiresAt, new Date())),
            notExists(
              db
                .select({ id: pgCouponRegistrationsTable.id })
                .from(pgCouponRegistrationsTable)
                .where(
                  and(
                    eq(pgCouponRegistrationsTable.userId, userId),
                    eq(pgCouponRegistrationsTable.couponId, pgCouponsTable.id),
                  ),
                ),
            ),
          ),
        );
      return Number(row?.value ?? 0);
    },
    options,
  );
}

export async function getPostgresCouponRegistrations(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresCouponOptions = {},
): Promise<number[]> {
  return withCouponDatabase(
    env,
    "get_registrations",
    async (db) => {
      const rows = await db
        .select({ couponId: pgCouponRegistrationsTable.couponId })
        .from(pgCouponRegistrationsTable)
        .where(eq(pgCouponRegistrationsTable.userId, userId));
      return rows.map(({ couponId }) => couponId);
    },
    options,
  );
}

export async function registerPostgresCoupon(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  couponId: number,
  options: PostgresCouponOptions = {},
): Promise<void> {
  await withCouponDatabase(
    env,
    "register",
    async (db) => {
      const now = new Date();
      await db
        .insert(pgCouponRegistrationsTable)
        .values({
          uid: nanoid(8),
          userId,
          couponId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [pgCouponRegistrationsTable.userId, pgCouponRegistrationsTable.couponId],
        });
    },
    options,
  );
}

export async function unregisterPostgresCoupon(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  couponId: number,
  options: PostgresCouponOptions = {},
): Promise<void> {
  await withCouponDatabase(
    env,
    "unregister",
    async (db) => {
      await db
        .delete(pgCouponRegistrationsTable)
        .where(and(eq(pgCouponRegistrationsTable.userId, userId), eq(pgCouponRegistrationsTable.couponId, couponId)));
    },
    options,
  );
}
