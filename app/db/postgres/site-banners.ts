import { and, asc, gt, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgSiteBannersTable } from "~/db/postgres/schema";
import {
  isSiteBannerPreset,
  isSiteBannerScreen,
  type SiteBanner,
  type SiteBannerPreset,
  type SiteBannerScreen,
} from "~/domain/site-banner";
import { normalizeInstant, type UtcIsoString } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

type PostgresSiteBannerRow = typeof pgSiteBannersTable.$inferSelect;

export type PostgresSiteBannerOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

function normalizePostgresInstant(value: string | Date): UtcIsoString {
  return normalizeInstant(value instanceof Date ? value.toISOString() : value);
}

function toSiteBanner(row: PostgresSiteBannerRow): SiteBanner {
  const colorPreset = row.colorPreset;
  const screens = row.screens;
  if (!isSiteBannerPreset(colorPreset) || !screens.every(isSiteBannerScreen)) {
    throw new Error(`Invalid site banner enum value for ${row.uid}`);
  }

  return {
    uid: row.uid,
    message: row.message,
    colorPreset: colorPreset as SiteBannerPreset,
    link: row.link,
    screens: screens as SiteBannerScreen[],
    startsAt: normalizePostgresInstant(row.startsAt),
    endsAt: normalizePostgresInstant(row.endsAt),
    createdAt: normalizePostgresInstant(row.createdAt),
    updatedAt: normalizePostgresInstant(row.updatedAt),
  };
}

async function selectActive(
  env: Pick<Env, "HYPERDRIVE">,
  now: Date,
  options: PostgresSiteBannerOptions,
): Promise<SiteBanner | null> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.operation.name", "select");
        span?.setAttribute("db.collection.name", "site_banners");
        const rows = await drizzle(client)
          .select()
          .from(pgSiteBannersTable)
          .where(and(lte(pgSiteBannersTable.startsAt, now), gt(pgSiteBannersTable.endsAt, now)))
          .orderBy(asc(pgSiteBannersTable.endsAt), asc(pgSiteBannersTable.uid))
          .limit(1);
        span?.setAttribute("db.response.returned_rows", rows.length);
        return rows[0] ? toSiteBanner(rows[0]) : null;
      };
      return ctx ? ctx.tracing.enterSpan("postgres.site_banners.get_active", execute) : execute();
    },
    createClient,
    ctx,
  );
}

export async function getPostgresActiveSiteBanner(
  env: Pick<Env, "HYPERDRIVE">,
  now: UtcIsoString | Date = new Date(),
  options: PostgresSiteBannerOptions = {},
): Promise<SiteBanner | null> {
  const instant = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Invalid site banner time: ${String(now)}`);
  }
  return selectActive(env, instant, options);
}
