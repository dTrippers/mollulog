import { getPostgresActiveSiteBanner } from "~/db/postgres/site-banners";
import { isSiteBannerActive, type SiteBanner } from "~/domain/site-banner";
import { cacheKey, fetchRouteCached } from "~/lib/cache";
import { captureServerError, getLogger } from "~/lib/observability.server";

// Keep schedule changes responsive while retaining a short outage fallback.
// Cached rows are checked against `now` again below, so expired banners never render from stale data.
const SITE_BANNER_CACHE_FRESH_TTL = 30;
const SITE_BANNER_CACHE_MAX_STALE_TTL = 5 * 60;
const SITE_BANNER_CACHE_EXPIRATION_TTL = 10 * 60;

export async function getSiteBanner(
  env: Env,
  now: Date = new Date(),
  ctx?: ExecutionContext,
): Promise<SiteBanner | null> {
  try {
    const banner = await fetchRouteCached(
      env,
      ctx,
      cacheKey("route", "site-banner", 1, "active"),
      () => getPostgresActiveSiteBanner(env, now, { ctx }),
      false,
      {
        freshTtl: SITE_BANNER_CACHE_FRESH_TTL,
        maxStaleTtl: SITE_BANNER_CACHE_MAX_STALE_TTL,
        expirationTtl: SITE_BANNER_CACHE_EXPIRATION_TTL,
      },
    );

    return banner && isSiteBannerActive(banner, now) ? banner : null;
  } catch (error) {
    const errorContext = {
      view: "site_banner",
      operation: "get_active",
    };
    getLogger(env, ctx, { view: "site_banner" }).error("Failed to load active site banner", error, {
      operation: "get_active",
    });
    captureServerError(error, errorContext);
    return null;
  }
}
