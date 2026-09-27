import {
  getPostgresNavigationMenuBadges,
  type PostgresNavigationMenuBadgeOptions,
} from "~/db/postgres/navigation-menu-badges";

export function getNavigationMenuBadges(
  env: Env,
  options: PostgresNavigationMenuBadgeOptions = {},
) {
  return getPostgresNavigationMenuBadges(env, options);
}
