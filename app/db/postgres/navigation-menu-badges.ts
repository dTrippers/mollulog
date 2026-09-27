import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgNavigationMenuBadgesTable } from "~/db/postgres/schema";
import type {
  MenuBadgeLabelMode,
  MenuBadgeRedDotMode,
  StoredMenuBadge,
} from "~/domain/navigation-menu-badges";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export type PostgresNavigationMenuBadgeOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

type PostgresNavigationMenuBadgeRow = typeof pgNavigationMenuBadgesTable.$inferSelect;

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function toStoredMenuBadge(row: PostgresNavigationMenuBadgeRow): StoredMenuBadge {
  return {
    menuId: row.menuId,
    labelMode: row.labelMode as MenuBadgeLabelMode,
    label: row.label,
    redDotMode: row.redDotMode as MenuBadgeRedDotMode,
    startsAt: toIso(row.startsAt),
    endsAt: toIso(row.endsAt),
  };
}

export async function getPostgresNavigationMenuBadges(
  env: Pick<Env, "HYPERDRIVE">,
  options: PostgresNavigationMenuBadgeOptions = {},
): Promise<StoredMenuBadge[]> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.operation.name", "select");
        span?.setAttribute("db.collection.name", "navigation_menu_badges");
        const rows = await drizzle(client)
          .select()
          .from(pgNavigationMenuBadgesTable)
          .orderBy(asc(pgNavigationMenuBadgesTable.menuId));
        span?.setAttribute("db.response.returned_rows", rows.length);
        return rows.map(toStoredMenuBadge);
      };
      return ctx ? ctx.tracing.enterSpan("postgres.navigation_menu_badges.list", execute) : execute();
    },
    createClient,
    ctx,
  );
}
